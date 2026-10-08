require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Game = require('../models/Game');
const GameKey = require('../models/GameKey');
const Mod = require('../models/Mod');
const Post = require('../models/Post');
const { encryptKey, hashKey, makeDemoKey } = require('../lib/keyCrypto');

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pixelvault';

const COVERS = [
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80',
  'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=800&q=80',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&q=80',
  'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&q=80',
  'https://images.unsplash.com/photo-1560253023-3ec5d502959f?w=800&q=80',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&q=80',
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=800&q=80',
  'https://images.unsplash.com/photo-1519669556878-63bdad8a1a49?w=800&q=80'
];

// Steam-aligned genre distribution (100 games)
const GENRE_POOL = [
  ['Action', 'Shooter'], ['Action', 'Adventure'], ['Adventure', 'Indie'],
  ['RPG', 'Adventure'], ['RPG', 'Strategy'], ['Strategy', 'Simulation'],
  ['Simulation', 'Casual'], ['Sports', 'Simulation'], ['Racing', 'Sports'],
  ['Casual', 'Indie'], ['Indie', 'Puzzle'], ['Horror', 'Survival'],
  ['Puzzle', 'Platformer'], ['Shooter', 'Survival'], ['Fighting', 'Action'],
  ['Survival', 'Open World'], ['Souls-like', 'Action'], ['Roguelike', 'Indie'],
  ['Metroidvania', 'Platformer'], ['Visual Novel', 'Adventure'],
  ['Point & Click', 'Adventure'], ['Tower Defense', 'Strategy'],
  ['MOBA', 'Free to Play'], ['Battle Royale', 'Shooter'],
  ['Action', 'Free to Play'], ['RPG', 'Free to Play'],
  ['Adventure', 'Open World'], ['Simulation', 'RPG'], ['Strategy', 'Roguelite'],
  ['Horror', 'Cozy'],
];
const TAG_POOL = ['Singleplayer', 'Multiplayer', 'Co-op', 'Online Co-Op', 'Open World', 'Story Rich', 'Atmospheric', 'Exploration', 'Fantasy', 'Sci-fi', 'Pixel Graphics', 'Anime', 'Cute', 'Souls-like', 'Roguelike', 'Metroidvania', 'Deckbuilding', 'Turn-Based', 'Crafting', 'Building', 'Base Building', 'Farming Sim', 'Choices Matter', 'Controller', 'Great Soundtrack', 'Replay Value', 'Difficult', 'Relaxing', 'Family Friendly', 'Moddable', 'PvP', 'PvE', 'Survival', 'Horror', 'Mystery'];
const FEATURE_POOL = ['Single-player', 'Online Co-op', 'Steam Achievements', 'Steam Cloud', 'Full controller support', 'Steam Workshop', 'Cloud Saves', 'Trading Cards'];
const PLATFORM_SETS = [
  ['Windows'], ['Windows'], ['Windows'], ['Windows', 'Mac'],
  ['Windows', 'Linux'], ['Windows', 'Mac', 'Linux'],
  ['Windows', 'Steam Deck'], ['Windows', 'VR'],
];
const ADJ = ['Starfall', 'Ember', 'Iron', 'Gilded', 'Null', 'Crimson', 'Hollow', 'Neon', 'Ashen', 'Golden', 'Silent', 'Frozen', 'Electric', 'Shadow', 'Storm', 'Pixel', 'Midnight', 'Solar', 'Lunar', 'Void', 'Rusty', 'Crystal', 'Obsidian', 'Shattered', 'Eternal'];
const NOUN = ['Drifters', 'Hollow', 'Requiem', 'Isles', 'Signal', 'Vanguard', 'Frontier', 'Odyssey', 'Protocol', 'Sanctum', 'Legion', 'Harbor', 'Circuit', 'Monsoon', 'Outpost', 'Relic', 'Warden', 'Cartographer', 'Alchemist', 'Nomad', 'Sentinel', 'Voyager', 'Depths', 'Empire', 'Mirage'];
const SUB = ['Proxima', 'Reborn', 'Echoes', 'Awakening', 'Chronicles', 'Uprising', 'Legacy', 'II', 'III', 'Remastered', 'Director\u2019s Cut', 'Winter Fest', ''];
const TAGLINES = [
  'Rogue-like space trucking across a dying nebula', 'Cozy-dark farming sim in a haunted valley',
  'Brutal mech souls-like. No checkpoints, no mercy', 'Hack rival networks in this deck-building puzzler',
  'Pirate trading adventure with player-run ports', 'Analog-horror nightmare. Headphones required',
  'Colony sim with real hydrology', 'Free-to-climb 3v3 fantasy brawler',
  'Open-world RPG with choices that matter', 'Tower defense with time manipulation',
  'Souls-like platformer with hand-drawn bosses', 'Co-op survival crafting on a shattered moon',
];
const PRICES = [0, 4.99, 9.99, 14.99, 19.99, 24.99, 29.99, 34.99, 39.99, 49.99];
const DISCOUNTS = [0, 0, 0, 10, 15, 20, 30, 40, 50, 75];

function pick(arr, i, salt = 0) { return arr[(i * 7 + salt * 13) % arr.length]; }

async function main() {
  await mongoose.connect(MONGO);
  console.log('[seed] connected');
  await Promise.all([User.deleteMany({}), Game.deleteMany({}), GameKey.deleteMany({}), Mod.deleteMany({}), Post.deleteMany({})]);
  try { await Game.syncIndexes(); await GameKey.syncIndexes(); } catch {}

  const pw = await bcrypt.hash('password123', 10);
  const [dev, gamer, modder] = await User.create([
    { username: 'neonforge', email: 'dev@neonforge.gg', passwordHash: pw, role: 'developer', devProfile: { studioName: 'NeonForge', website: 'https://neonforge.gg', payoutEmail: 'pay@neonforge.gg', verified: true, balanceOwed: 0 } },
    { username: 'vaultdweller', email: 'gamer@vault.gg', passwordHash: pw, role: 'user', bio: 'RPG enjoyer. 400h in vault crawlers.' },
    { username: 'modwitch', email: 'mods@vault.gg', passwordHash: pw, role: 'user', bio: 'I break games so you don\u2019t have to.' }
  ]);

  const usedTitles = new Set();
  const games = [];
  for (let i = 0; i < 100; i++) {
    let title = `${pick(ADJ, i, 1)} ${pick(NOUN, i, 2)}`;
    const sub = pick(SUB, i, 3);
    if (sub) title += `: ${sub}`;
    if (usedTitles.has(title)) title += ` ${Math.floor(i / 25) + 2}`;
    usedTitles.add(title);

    const genres = GENRE_POOL[i % GENRE_POOL.length];
    const tags = [pick(TAG_POOL, i, 1), pick(TAG_POOL, i, 2), pick(TAG_POOL, i, 5)].filter((v, idx, a) => a.indexOf(v) === idx);
    const platforms = PLATFORM_SETS[i % PLATFORM_SETS.length];
    const features = [pick(FEATURE_POOL, i, 1), pick(FEATURE_POOL, i, 4)].filter((v, idx, a) => a.indexOf(v) === idx);
    const isFree = i % 10 === 7; // ~10 free-to-play like Steam
    const price = isFree ? 0 : pick(PRICES, i, 4);
    const discountPct = isFree ? 0 : pick(DISCOUNTS, i, 6);
    const tagline = pick(TAGLINES, i, 7);
    const rating = ['E', 'E10+', 'T', 'M'][i % 4];
    // Gaming-themed covers only (random picsum landscapes look non-game-like)
    const cover = COVERS[i % COVERS.length];
    const shots = [COVERS[(i + 2) % COVERS.length], COVERS[(i + 4) % COVERS.length], COVERS[(i + 6) % COVERS.length]];

    const g = await Game.create({
      title,
      tagline,
      description: `${tagline}. Fictional demo catalog entry for coursework — Steam-style genres/tags/platforms, controller + cloud saves, 20h campaign + endgame loop. Not a real commercial title.`,
      developer: dev._id,
      studioName: i % 5 === 0 ? 'PixelVault Originals' : 'NeonForge',
      genres, tags, platforms, features,
      coverImage: cover,
      screenshots: shots,
      trailerUrl: '',
      price, discountPct,
      digitalSku: 'PV-DIG-' + (1000 + i),
      fileSizeGB: 2 + (i % 30),
      version: `1.${i % 9}.0`,
      physical: {
        enabled: i % 3 === 0 && price > 0,
        price: price > 0 ? +(price + 15).toFixed(2) : 0,
        stock: 30 + ((i * 7) % 60),
        weightLb: 0.6,
        warehouse: i % 2 ? 'US-WEST' : 'US-EAST',
        includes: ['Disc', 'Map poster', 'OST code']
      },
      systemReq: { os: 'Windows 10 64-bit', cpu: 'Ryzen 5 3600 / i5-10400', ram: '16 GB', gpu: 'RTX 3060', storage: '30 GB SSD' },
      rating,
      status: 'published',
      featured: i < 5,
      releaseDate: new Date(Date.now() - i * 86400000 * 9),
      modSupport: i % 4 !== 3,
      stats: {
        views: 400 + i * 97, unitsDigital: 80 + i * 11, unitsPhysical: 10 + (i % 20),
        revenueGross: 2000 + i * 320, reviewSum: 30 + (i % 20), reviewCount: 6 + (i % 9),
        keysAvailable: 0, keysSold: 0
      }
    });
    games.push(g);
  }

  // Demo keys: 8-12 fake DEMO-XXXXX keys per paid game (NOT real Steam keys).
  // Coursework placeholder only — redeem flow tested, keys clearly marked demo.
  let totalKeys = 0;
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    if (g.price <= 0) continue;
    const n = 8 + (i % 5); // 8..12
    const batchId = `seed-batch-${Math.floor(i / 20) + 1}`;
    const docs = [];
    for (let k = 0; k < n; k++) {
      const plain = makeDemoKey('DEMO');
      docs.push({
        game: g._id, batchId, platform: 'Steam', region: 'GLOBAL',
        codeEnc: encryptKey(plain),
        codeHash: hashKey(`${g._id}:${plain}`),
        status: 'available'
      });
    }
    try {
      await GameKey.insertMany(docs, { ordered: false });
      totalKeys += docs.length;
      await Game.updateOne({ _id: g._id }, { $set: { 'stats.keysAvailable': docs.length } });
    } catch (e) {
      const c = await GameKey.countDocuments({ game: g._id, status: 'available' });
      await Game.updateOne({ _id: g._id }, { $set: { 'stats.keysAvailable': c } });
      totalKeys += c;
    }
  }

  await Mod.create([
    { game: games[0]._id, title: 'Nebula HD Overhaul', tagline: '4K skyboxes + engine glow', description: 'Replaces all nebula textures and adds bloom presets.', author: modder._id, version: '2.1.0', downloadUrl: 'https://example.com/mods/nebula-hd.zip', tags: ['graphics'], stats: { downloads: 12400, endorsements: 2100, views: 30000 } },
    { game: games[2]._id, title: 'Mercy Mode (kinda)', tagline: 'Adds one mid-level checkpoint', description: 'For cowards. Us cowards. Regards.', author: modder._id, version: '1.0.4', downloadUrl: 'https://example.com/mods/mercy.zip', tags: ['gameplay'], stats: { downloads: 8300, endorsements: 1500, views: 19000 } },
    { game: games[1]._id, title: 'Ghost Pets Pack', tagline: 'Adopt 12 haunted animals', description: 'They follow you. They judge you. 10/10.', author: gamer._id, version: '1.2.0', downloadUrl: 'https://example.com/mods/ghostpets.zip', tags: ['content'], stats: { downloads: 5200, endorsements: 980, views: 12000 } }
  ]);

  await Post.create([
    { board: 'general', title: 'Welcome to the Vault — read this first', body: 'Be kind, mark spoilers, no key begging. Devs have gold names.', author: dev._id, pinned: true, tags: ['meta'] },
    { board: 'lfg', title: 'Bladecrest 3v3 — diamond supp looking for team (EU)', body: 'Online 19:00-23:00 CET. Ping me. No tilt pls.', author: gamer._id, game: games[7]._id, tags: ['pvp'] },
    { board: 'guides', title: 'How to beat Furnace Warden hitless', body: 'Phase 2: bait the slam, punish with charged R2. Full build inside.', author: modder._id, game: games[2]._id, tags: ['boss-guide'] },
    { board: 'support', title: 'Digital key shows "out of stock"?', body: 'Paid games need keysAvailable > 0. Devs restock in Dev console → Keys.', author: dev._id, tags: ['keys'] },
    { board: 'deals', title: 'Special Offers — up to 75% off this week', body: 'Filter Store → Special Offers. Keys auto-deliver to library.', author: gamer._id, game: games[5]._id, tags: ['deal'] }
  ]);

  console.log(`[seed] done: 3 users (password123), ${games.length} games, ~${totalKeys} demo keys, 3 mods, 5 posts`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
