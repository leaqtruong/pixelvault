/* Prove the schema no longer invents values that Steam never published.
   A Mongoose `default` fires even when the field is explicitly undefined,
   so this exercises Game.create() the way the developer-publish route does. */
require('dotenv').config();
const mongoose = require('mongoose');
const Game = require('../models/Game');

(async () => {
  let bad = 0;
  const ok = (n, c, x = '') => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const fresh = new Game({ title: 'probe', developer: new mongoose.Types.ObjectId(), price: 1 });
  const o = fresh.toObject();
  ok('a new game has no version', o.version === undefined, JSON.stringify(o.version));
  ok('a new game has no rating', o.rating === undefined, JSON.stringify(o.rating));
  ok('a new game has no install size', o.fileSizeGB === undefined, JSON.stringify(o.fileSizeGB));
  ok('a new game has no warehouse', o.physical?.warehouse === '', JSON.stringify(o.physical?.warehouse));
  ok('a new game has zero weight', o.physical?.weightLb === 0, String(o.physical?.weightLb));

  // and nothing in the database carries them either
  for (const f of ['version', 'rating', 'fileSizeGB']) {
    const n = await db.collection('games').countDocuments({ [f]: { $exists: true } });
    ok(`no stored game has a ${f}`, n === 0, n + ' rows');
  }
  const junk = await db.collection('games').countDocuments({ contentWarnings: { $elemMatch: { $eq: null } } });
  ok('no contentWarnings array holds nulls', junk === 0, junk + ' rows');

  const wh = await db.collection('games').countDocuments({ 'physical.warehouse': { $in: ['US-EAST', 'US-WEST'] } });
  ok('no placeholder warehouse remains', wh === 0, wh + ' rows');

  // a title that genuinely has a version set must survive
  await Game.create({
    title: 'probe-with-real-version', developer: new mongoose.Types.ObjectId(), price: 1,
    version: '2.3.1', rating: 'T',
  });
  const back = await Game.findOne({ title: 'probe-with-real-version' });
  ok('a developer-supplied version is kept', back.version === '2.3.1', JSON.stringify(back.version));
  ok('a developer-supplied rating is kept', back.rating === 'T', JSON.stringify(back.rating));
  await db.collection('games').deleteOne({ title: 'probe-with-real-version' });

  await mongoose.disconnect();
  console.log('\n' + (bad ? bad + ' FAILURES' : 'no fabricated values remain in the schema or the data'));
  process.exitCode = bad ? 1 : 0;
})().catch((e) => { console.error('check failed:', e.message); process.exitCode = 1; });