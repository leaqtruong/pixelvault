/* End-to-end proof that the storefront is reading real data out of MongoDB:
   every figure reported here is counted from the database, and the API is
   only allowed to answer when the connection is live. */
require('dotenv').config();
const mongoose = require('mongoose');
const B = 'http://127.0.0.1:3000';

(async () => {
  let bad = 0;
  const ok = (n, c, x = '') => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

  console.log('MONGO_URI = ' + String(process.env.MONGO_URI).replace(/\/\/[^@]*@/, '//***@'));
  console.log('mongoose version = ' + mongoose.version + '\n');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  ok('driver connects', mongoose.connection.readyState === 1, 'readyState=' + mongoose.connection.readyState + ' (1 = connected)');
  ok('connected database name', mongoose.connection.name === 'pixelvault', '"' + mongoose.connection.name + '"');

  const colls = await db.listCollections().toArray();
  ok('collections exist', colls.length > 0, colls.length + ': ' + colls.map((c) => c.name).sort().join(', '));

  const counts = {};
  for (const c of colls) counts[c.name] = await db.collection(c.name).countDocuments();
  console.log('  row counts: ' + JSON.stringify(counts));

  const serverInfo = await db.admin().serverStatus().catch(() => null);
  if (serverInfo) {
    console.log(`  server: ${serverInfo.version} · uptime ${Math.round(serverInfo.uptime)}s · ${serverInfo.storageEngine.name}`);
    ok('storage engine is wiredTiger', serverInfo.storageEngine && serverInfo.storageEngine.name === 'wiredTiger');
  }

  const [gCount, tCount] = [counts.games || 0, counts.toys || 0];
  ok('catalog has games', gCount > 0, gCount + ' games');
  ok('catalog has merch', tCount > 0, tCount + ' toys');

  // index coverage — the store filters on these
  const gameIdx = await db.collection('games').indexes();
  console.log('  games indexes: ' + gameIdx.map((i) => i.name).join(', '));
  const idxNames = gameIdx.map((i) => i.name);
  ok('indexed for genre filtering', idxNames.some((n) => n.includes('genres')), 'found: ' + idxNames.join(' | '));

  const keysIdx = await db.collection('gamekeys').indexes();
  const keyNames = keysIdx.map((i) => i.name);
  console.log('  gamekeys indexes: ' + keyNames.join(', '));
  ok('unique index prevents duplicate keys', keysIdx.some((i) => i.unique && Object.keys(i.key || {}).length === 1), keyNames.join(' | '));

  // now the API — it must not be able to answer from cache or a stub
  const stats = await fetch(B + '/api/stats').then((r) => r.json());
  ok('API reports the same game count as the database', stats.games === gCount, `api=${stats.games} db=${gCount}`);
  ok('API reports the same toy count as the database', stats.toys === tCount, `api=${stats.toys} db=${tCount}`);

  const home = await fetch(B + '/api/home').then((r) => r.json());
  ok('home ledger titles match', home.ledger.titles === gCount, `api=${home.ledger.titles} db=${gCount}`);

  // native-driver aggregate() returns a cursor, so it needs toArray()
  const keyAgg = await db.collection('games').aggregate([
    { $group: { _id: null, n: { $sum: '$stats.keysAvailable' } } },
  ]).toArray();
  const dbKeys = keyAgg[0] ? keyAgg[0].n : 0;
  ok('ledger key count matches the sum of per-game stock', home.ledger.keys === dbKeys, `api=${home.ledger.keys} db=${dbKeys}`);

  const freeKeys = await db.collection('gamekeys').countDocuments({ status: 'available' });
  ok('ledger key count matches the real key inventory', home.ledger.keys === freeKeys, `api=${home.ledger.keys} rows(status=available)=${freeKeys}`);

  // a write must be visible immediately
  const marker = 'dbcheck-' + Date.now();
  await db.collection('posts').insertOne({ board: 'meta', title: marker, body: 'written by the database check', author: null, createdAt: new Date() });
  const back = await db.collection('posts').findOne({ title: marker });
  ok('write then read back from the same database', !!back, 'marker ' + marker);
  await db.collection('posts').deleteOne({ title: marker });
  ok('test row removed again', (await db.collection('posts').countDocuments({ title: marker })) === 0);

  await mongoose.disconnect();
  console.log('\n' + (bad ? bad + ' FAILURES' : 'MongoDB is fully wired and serving the storefront'));
  // no process.exit(): forcing it while libuv still owns sockets makes Node
  // abort with an assertion on Windows, which reads like a failure
  process.exitCode = bad ? 1 : 0;
})().catch((e) => { console.error('check failed:', e.message); process.exitCode = 1; });