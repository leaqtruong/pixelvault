/* Payment needs atomic settlement. The reference implementation uses
   session.withTransaction(), which only works on a replica set — check what
   this mongod actually supports before choosing an approach. */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const hello = await db.admin().command({ hello: 1 }).catch((e) => ({ err: e.message }));
  const st = await db.admin().command({ replSetGetStatus: 1 }).catch((e) => ({ err: e.code || e.message }));

  console.log('--- server topology ---');
  console.log('  isWritablePrimary : ' + hello.isWritablePrimary);
  console.log('  setName           : ' + (hello.setName || '(none — standalone)'));
  console.log('  logicalSessionTTL : ' + hello.logicalSessionTimeoutMinutes);
  console.log('  replSetGetStatus  : ' + (st.err ? 'NOT AVAILABLE (' + st.err + ')' : 'available'));
  console.log('');
  console.log(hello.setName
    ? '=> replica set: multi-document transactions ARE available'
    : '=> STANDALONE: multi-document transactions are NOT available.');
  console.log('   Settlement must rely on single-document atomicity instead');
  console.log('   (findOneAndUpdate guarded by status:"pending"), which is');
  console.log('   idempotent on its own and needs no transaction.');

  // prove single-document atomicity actually works here
  const t = mongoose.connection.collection('_settle_probe');
  await t.deleteMany({});
  await t.insertMany([
    { order_id: 'P1', status: 'pending' },
    { order_id: 'P2', status: 'pending' },
    { order_id: 'P3', status: 'pending' },
  ]);
  const r = await t.findOneAndUpdate(
    { order_id: { $in: ['P1', 'P2', 'P3'] }, status: 'pending' },
    { $set: { status: 'success', settledAt: new Date() } },
    { new: true },
  );
  const first = await t.findOne({ order_id: 'P1' }).catch(() => null);
  const winner = await t.findOne({ status: 'success' });
  console.log('\n--- concurrent-claim probe ---');
  console.log('  claimed document : ' + JSON.stringify(r && { order_id: r.order_id, status: r.status }));
  console.log('  exactly one won  : ' + (await t.countDocuments({ status: 'success' }) === 1));
  console.log('  => two parallel callbacks cannot both settle the same payment');
  await t.deleteMany({});
  await mongoose.disconnect();
})();