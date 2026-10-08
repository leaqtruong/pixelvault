const mongoose = require('mongoose');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/pixelvault');
  const o = await mongoose.connection.db.collection('orders').deleteMany({});
  await mongoose.connection.db.collection('users').updateMany({}, { $set: { library: [], toyLibrary: [], purchaseHistory: [] } });
  // restore key/toy stock touched by smoke tests
  await mongoose.connection.db.collection('gamekeys').updateMany({ status: 'sold' }, { $set: { status: 'available', order: null, user: null, soldAt: null } });
  console.log('ORDERS_CLEARED=' + o.deletedCount);
  const g = await mongoose.connection.db.collection('games').countDocuments();
  const k = await mongoose.connection.db.collection('gamekeys').countDocuments({ status: 'available' });
  console.log('GAMES=' + g + ' AVAIL_KEYS=' + k);
  await mongoose.disconnect();
})();
