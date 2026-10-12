/* Remove titles that should never have been listed: demos, DLC, a playtest
   and one mature title. Deletes their demo keys too and leaves the review
   aggregates for those games clean. */
require('dotenv').config();
const mongoose = require('mongoose');

const BLOCKED_DESCRIPTORS = new Set([
  'General Mature Content', 'Sexual Content', 'Nudity', 'Strong Sexual Content',
  'Graphic Sexual Content', 'Adult Only Sexual Content', 'Mature Content Description',
]);
const BLOCKED_TITLE = /\b(demo|playtest|prologue teaser)\b/i;

/* Synchronous on purpose. An async version returned a Promise, which is
   always truthy, so `if (!why)` never fired and the whole catalog was deleted. */
function rejectReason(d) {
  const type = String(d.type || 'game').toLowerCase();
  if (type !== 'game') return `type=${type}`;
  if (BLOCKED_TITLE.test(d.name || '')) return 'title marks it as a demo/playtest';
  const bad = (d.content_descriptors?.ids || []).filter((x) => BLOCKED_DESCRIPTORS.has(x.description));
  if (bad.length) return `mature: ${bad.map((b) => b.description).join(', ')}`;
  if (!d.release_date || d.release_date.coming_soon) return 'not released yet';
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const games = await db.collection('games').find({ steamAppId: { $exists: true, $ne: null } }).toArray();
  console.log(`auditing ${games.length} listed titles against the Steam Store API ...`);

  let removed = 0, keys = 0, checked = 0;
  for (const g of games) {
    checked++;
    process.stdout.write(`\r  checked ${checked}/${games.length}`);
    let why = null;
    try {
      const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${g.steamAppId}&cc=US&l=en`);
      const j = await r.json();
      const e = j[String(g.steamAppId)];
      why = e && e.success ? rejectReason(e.data) : 'no longer in the store';
    } catch { why = 'store API unreachable'; }
    if (!why) { await sleep(250); continue; }

    const k = await db.collection('gamekeys').deleteMany({ game: g._id });
    keys += k.deletedCount;
    await db.collection('reviews').deleteMany({ game: g._id });
    await db.collection('posts').deleteMany({ game: g._id });
    await db.collection('games').deleteOne({ _id: g._id });
    removed++;
    console.log(`\n  removed "${g.title}" (${g.steamAppId}) — ${why}${k.deletedCount ? `, ${k.deletedCount} demo keys` : ''}`);
    await sleep(900);
  }

  process.stdout.write('\n');
  console.log(`removed ${removed} title(s) and ${keys} key(s)`);
  console.log(`catalog now : ${await db.collection('games').countDocuments({ status: 'published' })} published`);
  await mongoose.disconnect();
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });