// Import master's REAL installed games (from local Steam manifests) into PixelVault.
// Uses the public Steam Store API (no key needed) for name, capsule art,
// genres, prices, release date. Coursework demo: images hotlinked from
// Steam CDN, prices mirrored for illustration, keys are fake DEMO placeholders.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Game = require('../models/Game');
const GameKey = require('../models/GameKey');
const Mod = require('../models/Mod');
const Post = require('../models/Post');
const { encryptKey, hashKey, makeDemoKey } = require('../lib/keyCrypto');

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pixelvault';

// appids read from D:\Steam\steamapps + E:\SteamLibrary\steamapps manifests on this machine.
// 228980 (Steamworks Shared) is a redistributable, not a game — excluded.
// Extra: RimWorld (294100) + ULTRAKILL (1229490) found on disk as non-Steam copies.
const APPIDS = [
  105600, 1378290, 1973530, 203770, 220700, 2342950, 245170, 262060,
  2835570, 304930, 367520, 4270390, 4564320, 4791300, 568220, 632360,
  650700, 674940, 1669980, 209000, 2218560, 282800, 3562120, 371970,
  440, 550, 730, 774171, 294100, 1229490,
  // batch 2 — more market titles in the same taste (indie + co-op horror + AAA)
  413150, 1145360, 588650, 504230, 1794680, 646570, 620, 4000,
  252490, 739630, 1966720, 2881650, 1623730, 1086940, 1245620, 1030300,
  250900, 1145350,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDetail(appid) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=US&l=en`;
  const r = await fetch(url, { headers: { 'User-Agent': 'PixelVault-Coursework-Demo/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const entry = j[String(appid)];
  if (!entry || !entry.success) throw new Error('store API: no data');
  return entry.data;
}

function mapGame(appid, d, i) {
  const genres = (d.genres || []).map((g) => g.description).slice(0, 3);
  const cats = (d.categories || []).map((c) => c.description).slice(0, 6);
  const platforms = [];
  if (d.platforms?.windows) platforms.push('Windows');
  if (d.platforms?.mac) platforms.push('Mac');
  if (d.platforms?.linux) platforms.push('Linux');
  if (!platforms.length) platforms.push('Windows');
  const price = d.is_free ? 0 : (d.price_overview ? d.price_overview.final / 100 : 19.99);
  const discount = d.is_free ? 0 : (d.price_overview?.discount_percent || 0);
  const shots = [d.header_image, ...((d.screenshots || []).slice(0, 3).map((s) => s.path_full))].filter(Boolean);
  return {
    title: d.name,
    tagline: (d.short_description || '').slice(0, 160),
    description: `${d.short_description || d.name}\n\nReal store metadata (name, capsule art, genres, price) mirrored from Steam Store API for coursework illustration. Demo keys sold here are fake DEMO-XXXXX placeholders, not real Steam keys.`,
    studioName: (d.developers && d.developers[0]) || 'Various',
    genres: genres.length ? genres : ['Indie'],
    tags: [...new Set([...genres, ...cats.filter((c) => c.length < 24)])].slice(0, 6),
    platforms,
    features: cats,
    coverImage: d.header_image,
    screenshots: shots,
    price, discountPct: discount,
    digitalSku: `PV-STEAM-${appid}`,
    fileSizeGB: 5 + (appid % 40),
    version: '1.0.0',
    physical: { enabled: false, price: 0, stock: 0, weightLb: 0.6, warehouse: 'US-EAST', includes: [] },
    systemReq: { os: 'Windows 10 64-bit', cpu: 'Quad-core 3.0 GHz', ram: '8 GB RAM', gpu: 'GTX 1060', storage: '20 GB available space' },
    rating: 'T',
    status: 'published',
    featured: [105600, 1973530, 632360, 367520, 730].includes(appid),
    releaseDate: d.release_date?.date ? new Date(d.release_date.date) : new Date(Date.now() - i * 86400000 * 30),
    modSupport: true,
    steamAppId: appid,
    stats: {
      views: 800 + i * 137, unitsDigital: 150 + i * 17, unitsPhysical: 0,
      revenueGross: 4000 + i * 410, reviewSum: 40 + (i % 15), reviewCount: 10 + (i % 9),
      keysAvailable: 0, keysSold: 0,
    },
  };
}

async function main() {
  await mongoose.connect(MONGO);
  console.log('[import] connected');
  await Promise.all([Game.deleteMany({}), GameKey.deleteMany({}), Mod.deleteMany({}), Post.deleteMany({}), User.deleteMany({})]);
  try { await Game.syncIndexes(); await GameKey.syncIndexes(); } catch {}

  const pw = await bcrypt.hash('password123', 10);
  const [dev, gamer, modder] = await User.create([
    { username: 'neonforge', email: 'dev@neonforge.gg', passwordHash: pw, role: 'developer', devProfile: { studioName: 'NeonForge', website: 'https://neonforge.gg', payoutEmail: 'pay@neonforge.gg', verified: true, balanceOwed: 0 } },
    { username: 'vaultdweller', email: 'gamer@vault.gg', passwordHash: pw, role: 'user', bio: 'RPG enjoyer. 400h in vault crawlers.' },
    { username: 'modwitch', email: 'mods@vault.gg', passwordHash: pw, role: 'user', bio: 'I break games so you don\u2019t have to.' },
  ]);

  const games = [];
  let failed = [];
  for (let i = 0; i < APPIDS.length; i++) {
    const appid = APPIDS[i];
    try {
      const d = await fetchDetail(appid);
      const doc = mapGame(appid, d, i);
      const g = await Game.create({ ...doc, developer: dev._id });
      games.push(g);
      console.log(`[import] ok ${appid} ${doc.title}`);
    } catch (e) {
      failed.push(appid);
      console.log(`[import] FAIL ${appid}: ${e.message}`);
    }
    await sleep(1200); // be polite to the store API
  }

  let totalKeys = 0;
  for (const g of games) {
    if (g.price <= 0) continue;
    const docs = [];
    for (let k = 0; k < 10; k++) {
      const plain = makeDemoKey('DEMO');
      docs.push({ game: g._id, batchId: 'steam-import-batch-1', platform: 'Steam', region: 'GLOBAL', codeEnc: encryptKey(plain), codeHash: hashKey(`${g._id}:${plain}`), status: 'available' });
    }
    try {
      await GameKey.insertMany(docs, { ordered: false });
      totalKeys += docs.length;
      await Game.updateOne({ _id: g._id }, { $set: { 'stats.keysAvailable': docs.length } });
    } catch { /* skip dupes */ }
  }

  await Post.create([
    { board: 'general', title: 'Welcome to the Vault — real catalog is live', body: 'Catalog now mirrors games actually installed on this machine (Terraria, Limbus Company, Hollow Knight, CS2...). Images/names from Steam Store API for coursework. Keys are DEMO placeholders.', author: dev._id, pinned: true, tags: ['meta'] },
    { board: 'deals', title: 'Which game should I buy first?', body: 'Sort store by Top Rated and check Special Offers. Keys deliver instantly to library.', author: gamer._id, game: games[0]?._id, tags: ['help'] },
  ]);

  console.log(`[import] done: ${games.length} real games, ~${totalKeys} demo keys, failed=${failed.join(',') || 'none'}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
