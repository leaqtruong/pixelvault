/* Report what the workshop import has written so far. */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const total = await db.collection('mods').countDocuments();
  const withAuthor = await db.collection('mods').countDocuments({ 'source.author': { $exists: true, $ne: null } });
  const steam = await db.collection('mods').countDocuments({ 'source.provider': 'steam-workshop' });
  const noAuthor = steam - withAuthor;

  console.log(`mods rows written : ${total}`);
  console.log(`  sourced from Steam Workshop : ${steam}`);
  console.log(`  author name resolved        : ${withAuthor}`);
  console.log(`  author still null           : ${noAuthor}`);

  const games = await db.collection('games').find({}, { projection: { title: 1 } }).toArray();
  const byId = new Map(games.map((g) => [String(g._id), g.title]));
  const rows = await db.collection('mods').find({}, { projection: { game: 1 } }).toArray();
  const byGame = {};
  for (const r of rows) {
    const t = byId.get(String(r.game)) || '(unlinked)';
    byGame[t] = (byGame[t] || 0) + 1;
  }
  console.log(`  distinct games covered      : ${Object.keys(byGame).length}`);
  for (const [t, n] of Object.entries(byGame).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(n).padStart(3)}  ${t}`);
  }

  const sample = await db.collection('mods').findOne({ 'source.author': { $ne: null } });
  if (sample) {
    console.log('\nsample row (round-tripped through Mongo):');
    console.log('  title  : ' + sample.title);
    console.log('  author : ' + JSON.stringify(sample.source.author));
    console.log('  authorId: ' + sample.source.authorId);
    console.log('  url    : ' + sample.source.url);
    console.log('  subs   : ' + sample.mirror.subscriptions + '  size: ' + sample.mirror.fileSize);
    console.log('  version field set? ' + (sample.version === undefined ? 'no (correct)' : 'YES -> ' + sample.version));
  }
  await mongoose.disconnect();
})();