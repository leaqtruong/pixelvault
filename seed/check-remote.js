/* Report what a remote cluster holds, without ever printing the connection
   string. Works on a machine that can resolve Atlas as well as on a CI runner;
 * the thing it cannot do is connect, and it says so plainly rather than
 * reporting zeroes. */
require('dotenv').config();
const mongoose = require('mongoose');

const EXPECTED = ['users', 'games', 'toys', 'gamekeys', 'orders', 'reviews', 'mods', 'posts'];

const watchdog = setTimeout(() => { console.error('timed out'); process.exit(2); }, 60000);
watchdog.unref();

(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) { console.error('MONGO_URI is not set.'); process.exit(1); }
  console.log('target: ' + uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') + '\n');

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  } catch (e) {
    console.log('Cannot reach the cluster: ' + e.message);
    console.log('\nCheck:');
    console.log('  - MONGO_URI has the real password, not the literal text "<db_password>"');
    console.log('  - Network Access in Atlas contains 0.0.0.0/0');
    console.log('  - the username matches one you created');
    process.exit(1);
  }

  const db = mongoose.connection.db;
  const info = await db.admin().serverStatus().catch(() => null);
  console.log('server ' + (info ? info.version + '  (' + info.storageEngine.name + ')' : 'unknown'));

  const present = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  const missing = EXPECTED.filter((n) => !present.includes(n));
  console.log('collections: ' + present.length + ' of ' + EXPECTED.length + '\n');

  let total = 0;
  for (const n of [...EXPECTED, ...present.filter((n) => !EXPECTED.includes(n)).sort()]) {
    const c = await db.collection(n).countDocuments();
    total += c;
    console.log('  ' + n.padEnd(12) + String(c).padStart(7) + (present.includes(n) ? '' : '   (not created yet)'));
  }
  console.log('\n  total documents: ' + total.toLocaleString('en-US'));
  if (missing.length) console.log('  still empty: ' + missing.join(', '));

  await mongoose.disconnect();
  clearTimeout(watchdog);
  process.exit(0);
})();