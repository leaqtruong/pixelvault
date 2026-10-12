/* Seed customer reviews so the review surface is actually visible.
   A review requires the author to own the game, so this grants library
   entries first, then writes reviews directly and recomputes each game's
   review aggregates. Safe to re-run: it clears its own seeded rows first. */
require('dotenv').config();
const mongoose = require('mongoose');

const TEXTS = [
  { stars: 5, title: 'Still the best in the genre', body: 'Played it for 200 hours and it has not lost a step. The soundtrack alone is worth it.' },
  { stars: 4, title: 'Great, but the launch was rough', body: 'Runs well now. Had a rocky first week with bugs, but the patches sorted most of it out.' },
  { stars: 5, title: 'Exactly what I wanted', body: 'Bought on sale and did not regret it once. Good performance on my machine.' },
  { stars: 3, title: 'Decent, not remarkable', body: 'Fine for what it is, but the content feels thin next to bigger titles.' },
  { stars: 4, title: 'Solid co-op nights', body: 'Played with friends most weekends. Drop-in sessions are the main draw here.' },
  { stars: 5, title: 'Worth every penny', body: 'The demo made me curious and the full game delivered. Easy recommendation.' },
  { stars: 4, title: 'Slow start, strong finish', body: 'The opening hour drags but once the systems click it really comes together.' },
  { stars: 2, title: 'Not for me', body: 'Runs fine but the gameplay loop did not click at all. Refunded in my case.' },
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const users = await db.collection('users').find({}).toArray();
  const games = await db.collection('games').find({ status: 'published' }).toArray();
  if (!users.length || !games.length) { console.log('need users and games first'); process.exit(1); }

  // start clean so re-runs do not stack duplicates
  const oldSeeded = await db.collection('reviews').find({ seeded: true }).toArray();
  if (oldSeeded.length) await db.collection('reviews').deleteMany({ _id: { $in: oldSeeded.map((r) => r._id) } });

  const pick = (arr, i) => arr[i % arr.length];
  let written = 0;
  const touched = new Set();

  for (let i = 0; i < 14; i++) {
    const user = pick(users, i);
    const game = pick(games, i * 3 + 1);
    const t = pick(TEXTS, i);
    const exists = await db.collection('reviews').findOne({ game: game._id, user: user._id });
    if (exists) continue;
    // ownership is a precondition for reviewing, so grant it
    const has = (user.library || []).some((e) => String(e.game) === String(game._id));
    if (!has) {
      await db.collection('users').updateOne({ _id: user._id }, {
        $push: { library: { game: game._id, edition: 'digital', playMinutes: 60 * (3 + (i % 40)), achievements: [], firstPlayedAt: new Date() } },
      });
    }
    await db.collection('reviews').insertOne({
      game: game._id, user: user._id, stars: t.stars, title: t.title, body: t.body,
      playMinutesAtReview: 60 * (3 + (i % 40)), helpful: [], devResponse: undefined,
      seeded: true, createdAt: new Date(Date.now() - (14 - i) * 86400000), updatedAt: new Date(),
    });
    touched.add(String(game._id));
    written++;
  }

  // recompute aggregates for every game that now has reviews
  // the native driver's aggregate() returns a cursor, so it needs toArray()
  const agg = await db.collection('reviews').aggregate([
    { $group: { _id: '$game', sum: { $sum: '$stars' }, n: { $sum: 1 } } },
  ]).toArray();
  for (const a of agg) {
    await db.collection('games').updateOne({ _id: a._id }, { $set: { 'stats.reviewSum': a.sum, 'stats.reviewCount': a.n } });
  }

  console.log(`reviews written : ${written}`);
  console.log(`reviews total   : ${await db.collection('reviews').countDocuments()}`);
  console.log(`games with reviews: ${agg.length}`);
  await mongoose.disconnect();
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });