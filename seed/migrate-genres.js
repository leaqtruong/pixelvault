/* Convert games.genres from an array of strings into Genre ObjectIds.
 *
 * Run once before deploying the genre-refactor code:
 *   node seed/migrate-genres.js
 *
 * Safe to re-run: documents that already point at Genre ids are left alone.
 * Uses the native collection API so Mongoose does not try to cast the old
 * string values through the new ObjectId schema while reading them.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Genre = require('../models/Genre');
const { slugify } = require('../lib/genres');

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const games = await db.collection('games').find({}, { projection: { genres: 1, title: 1 } }).toArray();

  const names = new Set();
  for (const game of games) {
    for (const value of game.genres || []) {
      if (typeof value === 'string') names.add(value.trim());
    }
  }

  let order = 0;
  const byName = new Map();
  for (const name of [...names].filter(Boolean).sort((a, b) => a.localeCompare(b))) {
    const slug = slugify(name);
    if (!slug) continue;
    const genre = await Genre.findOneAndUpdate(
      { slug },
      { $setOnInsert: { slug, name, active: true, sortOrder: order++ } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    byName.set(name.toLowerCase(), genre._id);
  }

  let changed = 0;
  for (const game of games) {
    const ids = [];
    for (const value of game.genres || []) {
      if (value && typeof value === 'object' && value._bsontype === 'ObjectId') {
        ids.push(value);
        continue;
      }
      const genre = byName.get(String(value).trim().toLowerCase());
      if (genre) ids.push(genre);
    }
    const unique = [...new Set(ids.map(String))].map((id) => new mongoose.Types.ObjectId(id));
    const before = (game.genres || []).map(String).sort().join(',');
    const after = unique.map(String).sort().join(',');
    if (before !== after) {
      await db.collection('games').updateOne({ _id: game._id }, { $set: { genres: unique } });
      changed++;
    }
  }

  const all = await Genre.find({}).sort({ sortOrder: 1, name: 1 }).lean();
  console.log(`[genres] ${all.length} genres, ${changed}/${games.length} games updated.`);
  for (const g of all) {
    const count = await db.collection('games').countDocuments({ genres: g._id });
    console.log(`  ${g.slug.padEnd(24)} ${String(count).padStart(3)} games  ${g.name}`);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('[genres] migration failed:', e.message);
  process.exit(1);
});
