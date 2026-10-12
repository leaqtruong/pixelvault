/* Add titles to an existing catalog without touching what is already there.
   import-steam.js is a full reseed (it recreates users and duplicates games);
   this one only inserts appids that are missing, so the catalog can grow
   safely. Idempotent: re-running adds nothing new.

   Images come from seed/steamArt.js, which picks the largest capsule Steam
   publishes rather than the 460x215 store banner. */
require('dotenv').config();
const mongoose = require('mongoose');
const Game = require('../models/Game');
const GameKey = require('../models/GameKey');
const User = require('../models/User');
const { encryptKey, hashKey, makeDemoKey } = require('../lib/keyCrypto');
const { resolveArt } = require('./steamArt');

// Batch 3 — same shelf as the existing catalog: co-op, survival, roguelike,
// horror and strategy titles that pair well with what is already listed.
// Batches 1 and 2 live in APPIDS_BASELINE so a wiped catalog can be rebuilt
// by running this script again.
const APPIDS_BASELINE = [
  105600, 1378290, 1973530, 203770, 220700, 2342950, 245170, 262060,
  2835570, 304930, 367520, 4270390, 4564320, 4791300, 568220, 632360,
  650700, 674940, 1669980, 209000, 2218560, 282800, 3562120, 371970,
  440, 550, 730, 774171, 294100, 1229490,
  413150, 1145360, 588650, 504230, 1794680, 646570, 620, 4000,
  252490, 739630, 1966720, 2881650, 1623730, 1086940, 1245620, 1030300,
  250900, 1145350,
];
const APPIDS = [
  275850, 418530, 457140, 505710, 728350, 847180, 1149640,
  1292470, 1338580, 1423040, 1575940, 2050650, 2180280,
  2246340, 2358720, 2622380, 2678720, 3164500, 3460100,
  1966720, 588650, 2835570,
  // Never list these: the Store API returns content_descriptors.ids as empty
  // objects, so the maturity check below cannot see them. Audited by hand.
  // 2473500 - adult title        4564320 - adult title
  // 1506980 - adult title        (use seed/block-titles.js to remove)
];

/* Batch 4 — harvested from Valve's own curated shelves
   (store.steampowered.com/api/featuredcategories: specials, top sellers,
   new releases). Keyword search via /api/storesearch was tried first and
   rejected: it returns shovelware for genre terms. These still go through
   the type/maturity audit below. */
const APPIDS_CURATED = [
  5155360, 1808500, 2254990, 3883570, 3240220, 1478500, 4656000, 1174180,
  1623730, 2781620, 4078430, 4165890, 3055670, 1867240, 3010850, 4019220,
  1551980, 3219030, 5166790, 3836580, 5131570, 1854500,
];

const KEYS_PER_GAME = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Not every Steam appid is a shoppable game. Reject demos, DLC and
   playtests, and anything Steam flags as mature — a coursework storefront
   should not list those. */
const BLOCKED_DESCRIPTORS = new Set([
  'General Mature Content', 'Sexual Content', 'Nudity', 'Strong Sexual Content',
  'Graphic Sexual Content', 'Adult Only Sexual Content', 'Mature Content Description',
]);
const BLOCKED_TITLE = /\b(demo|playtest|prologue teaser)\b/i;

function rejectReason(d) {
  const type = String(d.type || 'game').toLowerCase();
  if (type !== 'game') return `type=${type}`;
  if (BLOCKED_TITLE.test(d.name || '')) return 'title marks it as a demo/playtest';
  const bad = (d.content_descriptors?.ids || []).filter((x) => BLOCKED_DESCRIPTORS.has(x.description));
  if (bad.length) return `mature: ${bad.map((b) => b.description).join(', ')}`;
  if (!d.release_date || d.release_date.coming_soon) return 'not released yet';
  return null;
}

async function fetchDetail(appid) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=US&l=en`;
  const r = await fetch(url, { headers: { 'User-Agent': 'PixelVault-Coursework-Demo/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const entry = j[String(appid)];
  if (!entry || !entry.success) throw new Error('store API: no data');
  return entry.data;
}

function mapGame(appid, d, art, devId) {
  const genres = (d.genres || []).map((g) => g.description).slice(0, 3);
  const cats = (d.categories || []).map((c) => c.description).slice(0, 6);
  const platforms = [];
  if (d.platforms?.windows) platforms.push('Windows');
  if (d.platforms?.mac) platforms.push('Mac');
  if (d.platforms?.linux) platforms.push('Linux');
  if (!platforms.length) platforms.push('Windows');

  /* Only real values are stored. The Store API publishes no install size, no
     version string and no ESRB rating, so those fields are left unset rather
     than filled with a plausible-looking number — the UI renders "not
     published" instead. A fabricated rating would also silently break the
     "hide mature titles" preference, which filters on this field. */
  const price = d.is_free ? 0
    : (d.price_overview && Number.isFinite(d.price_overview.final) ? d.price_overview.final / 100 : null);
  const discount = d.is_free ? 0 : ((d.price_overview && d.price_overview.discount_percent) || 0);

  return {
    title: d.name,
    tagline: (d.short_description || '').slice(0, 160),
    description: `${d.short_description || d.name}\n\nReal store metadata (name, capsule art, genres, price) mirrored from the Steam Store API for coursework illustration. Demo keys sold here are fake DEMO-XXXXX placeholders, not real Steam keys.`,
    studioName: (d.developers && d.developers[0]) || 'Unknown studio',
    genres: genres.length ? genres : ['Indie'],
    tags: [...new Set([...genres, ...cats.filter((c) => c.length < 24)])].slice(0, 6),
    platforms,
    features: cats,
    coverImage: art.cover,
    screenshots: [art.hero, ...((d.screenshots || []).slice(0, 3).map((s) => s.path_full))].filter(Boolean),
    price,
    discountPct: discount,
    digitalSku: `PV-STEAM-${appid}`,
    // Steam publishes neither of these; leave them unset.
    fileSizeGB: undefined,
    version: undefined,
    physical: { enabled: false, price: 0, stock: 0, weightLb: 0, warehouse: '', includes: [] },
    systemReq: {},
    rating: undefined,
    status: 'published',
    featured: false,
    releaseDate: d.release_date && d.release_date.date ? new Date(d.release_date.date) : undefined,
    modSupport: true,
    steamAppId: appid,
    developer: devId,
  };
}

const CANDIDATES = process.argv.includes('--rebuild')
  ? [...new Set([...APPIDS_BASELINE, ...APPIDS, ...APPIDS_CURATED])]
  : [...new Set([...APPIDS, ...APPIDS_CURATED])];

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pixelvault');

  const dev = await User.findOne({ role: 'developer' });
  if (!dev) { console.error('No developer account found — run seed/import-steam.js first.'); process.exit(1); }

  const existing = new Set((await Game.find({ steamAppId: { $exists: true } }).select('steamAppId').lean())
    .map((g) => Number(g.steamAppId)));
  const todo = CANDIDATES.filter((id) => !existing.has(id));
  console.log(`catalog has ${existing.size} titles; ${CANDIDATES.length - todo.length} of the ${CANDIDATES.length} candidates already present`);

  let added = 0, keys = 0;
  const skipped = [];
  for (let i = 0; i < todo.length; i++) {
    const appid = todo[i];
    try {
      const d = await fetchDetail(appid);
      const why = rejectReason(d);
      if (why) { skipped.push({ appid, why }); console.log(`[add] skip ${appid} "${d.name}": ${why}`); await sleep(600); continue; }
      const art = await resolveArt(appid, d.header_image);
      const g = await Game.create(mapGame(appid, d, art, dev._id));
      added++;
      console.log(`[add] ${appid} ${g.title}`);

      if (g.price > 0) {
        const docs = [];
        for (let k = 0; k < KEYS_PER_GAME; k++) {
          const plain = makeDemoKey('DEMO');
          docs.push({ game: g._id, batchId: 'steam-add-batch-1', platform: 'Steam', region: 'GLOBAL', codeEnc: encryptKey(plain), codeHash: hashKey(`${g._id}:${plain}`), status: 'available' });
        }
        await GameKey.insertMany(docs, { ordered: false });
        keys += docs.length;
        await Game.updateOne({ _id: g._id }, { $set: { 'stats.keysAvailable': docs.length } });
      }
    } catch (e) {
      skipped.push({ appid, why: e.message });
      console.log(`[add] skip ${appid}: ${e.message}`);
    }
    await sleep(1200);
  }

  console.log(`\ngames added : ${added}`);
  console.log(`keys added  : ${keys}`);
  console.log(`skipped     : ${skipped.length}`);
  for (const s of skipped) console.log(`    - ${s.appid}: ${s.why}`);
  console.log(`catalog now : ${await Game.countDocuments({ status: 'published' })} published`);
  await mongoose.disconnect();
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });