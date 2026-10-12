/* Fill in real per-title data the catalog was missing: system requirements,
   publishers, language counts, content warnings and Steam's own category
   list. Everything comes from the public Store API, so nothing is invented.
   Safe to re-run; it only overwrites fields it parsed from the API. */
require('dotenv').config();
const mongoose = require('mongoose');
const { reqLines, reqFields, summarise } = require('./steamReq');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Steam lists a lot of storefront plumbing alongside gameplay features.
   Keep the ones a buyer actually filters on. */
const KEEP_CATEGORIES = new Set([
  'Single-player', 'Multi-player', 'Co-op', 'Online Co-op', 'Shared/Split Screen Co-op',
  'Shared/Split Screen', 'PvP', 'Online PvP', 'Massively Multiplayer', 'Battle Royale',
  'Steam Achievements', 'Full controller support', 'Steam Cloud', 'Steam Workshop',
  'Family Sharing', 'Partial Controller Support', 'Includes level editor',
  'In-App Purchases', 'Steam Deck Compatible', 'VR Supported', 'Remote Play on TV',
]);
/* Storefront furniture we do not surface. */
const DROP_PREFIX = /^(Stats|Remote Play on (Phone|Tablet|TV)|Steam Timeline|Commentary available|Steam Input API Support|DualShock Controller Support|DualSense Controller Support|Save Anytime|Adjustable Text Size|Camera Comfort|Color Alternatives|Custom Volume Controls|Playable without Timed Input|Stereo Sound|Surround Sound|Captions available|Steam Deck Verified|Valve Anti-Cheat)/i;

function platformKey(k) {
  if (k.startsWith('pc')) return 'Windows';
  if (k.startsWith('mac')) return 'Mac';
  if (k.startsWith('linux')) return 'Linux';
  return null;
}

(async () => {
  const dry = process.argv.includes('--dry');
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const games = await db.collection('games').find({ steamAppId: { $exists: true, $ne: null } }).sort({ title: 1 }).toArray();
  console.log(`enriching ${games.length} titles${dry ? ' (dry run)' : ''}`);

  const genreTotals = new Map();
  const catTotals = new Map();
  let done = 0, enriched = 0, missing = 0;

  for (const g of games) {
    const id = g.steamAppId;
    let d = null;
    try {
      const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=US&l=en`);
      const j = await r.json();
      const e = j[String(id)];
      if (e && e.success) d = e.data;
    } catch {}
    done++;

    if (!d) { missing++; console.log(`  ${g.title}: store API unreachable, left as-is`); await sleep(700); continue; }

    const minimum = {}, recommended = {}, lines = {};
    let flatMin = null, flatRec = null;
    for (const [key, block] of Object.entries({
      Windows: d.pc_requirements, Mac: d.mac_requirements, Linux: d.linux_requirements,
    })) {
      if (!block) continue;
      const min = reqLines(block.minimum);
      const rec = reqLines(block.recommended);
      if (min.length) minimum[key] = summarise(reqFields(min), g.systemReq?.os || '');
      if (rec.length) recommended[key] = summarise(reqFields(rec), '');
      const all = [...min, ...rec];
      if (all.length) lines[key] = all;
      if (key === 'Windows') {
        const mf = reqFields(min), rf = reqFields(rec);
        flatMin = { os: mf.os, cpu: mf.cpu, ram: mf.ram, gpu: mf.gpu, storage: mf.storage };
        const src = Object.keys(rf).length ? rf : mf;
        flatRec = { os: src.os, cpu: src.cpu, ram: src.ram, gpu: src.gpu, storage: src.storage };
      }
    }

    const genres = (d.genres || []).map((x) => x.description);
    for (const x of genres) genreTotals.set(x, (genreTotals.get(x) || 0) + 1);
    const cats = (d.categories || [])
      .map((x) => x.description)
      .filter((x) => !DROP_PREFIX.test(x) && KEEP_CATEGORIES.has(x));
    for (const x of cats) catTotals.set(x, (catTotals.get(x) || 0) + 1);

    const content = (d.content_descriptors?.ids || []).map((x) => x.description);
    const publishers = (d.publishers || []).join(', ');

    const hasReq = Object.keys(minimum).length > 0;
    if (hasReq) enriched++; else missing++;

    if (!dry) {
      const set = {
        genres, categories: cats, features: cats,
        publisher: publishers,
        languages: (d.supported_languages || []).length,
        contentWarnings: content,
        deckVerified: (d.categories || []).some((c) => /Steam Deck/i.test(c.description))
          ? (d.categories.find((c) => /Steam Deck/i.test(c.description)).description.includes('Verified') ? 'Verified' : 'Compatible')
          : '',
      };
      if (hasReq) {
        set.systemReq = { ...(flatMin || {}), minimum, recommended, lines, source: 'Steam Store API' };
      }
      await db.collection('games').updateOne({ _id: g._id }, { $set: set });
    }

    if (!hasReq) console.log(`  ${g.title}: Steam publishes no requirements for this title`);
    await sleep(700);
  }

  console.log(`\nparsed requirements for ${enriched} of ${done} titles`);
  console.log(`genres in catalog (${genreTotals.size}):`);
  for (const [k, v] of [...genreTotals].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
  console.log(`categories in catalog (${catTotals.size}):`);
  for (const [k, v] of [...catTotals].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
  if (dry) console.log('\nre-run without --dry to write');
  await mongoose.disconnect();
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });