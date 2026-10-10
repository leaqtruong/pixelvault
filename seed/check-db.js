/* Catalog sanity check for start-website.bat.
   Prints one short line the batch file echoes straight to the console:
   how many games / toys the connected database actually holds, and what to
   run if the catalog is empty. Exits non-zero when MongoDB cannot be reached
   so the launcher can tell "database down" apart from "database is empty". */
require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI;
const SEED = 'node seed/import-steam.js  then  node seed/seed-toys.js';

(async () => {
  if (!uri) {
    console.log('[X] MONGO_URI is not set in .env - nothing to connect to.');
    process.exit(1);
  }
  let db;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 6000 });
    db = mongoose.connection.db;
  } catch (err) {
    console.log('[X] Cannot reach MongoDB at ' + uri.replace(/\/\/[^@]*@/, '//***@'));
    console.log('    ' + err.message);
    process.exit(1);
  }
  try {
    const name = mongoose.connection.name;
    const col = (n) => db.collection(n);
    const [games, toys, keys, users, orders] = await Promise.all([
      col('games').countDocuments(),
      col('toys').countDocuments(),
      col('gamekeys').countDocuments(),
      col('users').countDocuments(),
      col('orders').countDocuments(),
    ]);
    console.log(`[ok] Connected to "${name}"  ${games} games · ${toys} toys · ${keys} keys · ${users} users · ${orders} orders`);
    if (games === 0 || toys === 0) {
      console.log('[warn] The catalog is empty. To fill it, run:');
      console.log('       ' + SEED);
      console.log('    Point MONGO_URI at the database that already holds your seed if this is the wrong one.');
    }
    process.exit(0);
  } catch (err) {
    console.log('[X] Query failed: ' + err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();