/* Undo the key-rotation end-to-end test.
   The test created one digital order; this returns its claimed key to stock,
   removes the library entry and deletes the order, so the demo data is
   pristine again.

   Safety: refuses to run unless it can identify the order unambiguously. */
const mongoose = require('mongoose');
require('dotenv').config();

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const all = await db.collection('orders').find({}).toArray();
  if (all.length !== 1) {
    console.log(`Expected exactly 1 test order, found ${all.length}. Nothing changed.`);
    console.log('Run seed/clear-orders.js manually if you really want them all gone.');
    await mongoose.disconnect();
    process.exit(1);
  }
  const o = all[0];
  const keyIds = (o.items || []).flatMap((i) => i.keyIds || []);
  const gameIds = (o.items || []).filter((i) => i.game).map((i) => new mongoose.Types.ObjectId(i.game));

  if (keyIds.length) {
    await db.collection('gamekeys').updateMany(
      { _id: { $in: keyIds.map((k) => (k._id || k)) } },
      { $set: { status: 'available' }, $unset: { order: '', soldAt: '' } }
    );
    for (const gid of gameIds) {
      await db.collection('games').updateOne({ _id: gid }, { $inc: { 'stats.keysAvailable': 1, unitsSold: -1 } });
    }
    await db.collection('users').updateMany({ _id: o.user }, { $pull: { library: { game: { $in: gameIds } } } });
    console.log(`released ${keyIds.length} key(s) back to available`);
  }

  await db.collection('orders').deleteOne({ _id: o._id });
  console.log('deleted order ' + o._id);

  console.log('orders now     = ' + await db.collection('orders').countDocuments());
  console.log('keys available = ' + await db.collection('gamekeys').countDocuments({ status: 'available' }));
  await mongoose.disconnect();
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });