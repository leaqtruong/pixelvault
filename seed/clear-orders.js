const mongoose = require('mongoose');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/pixelvault');
  const r = await mongoose.connection.db.collection('orders').deleteMany({});
  console.log('CLEARED_ORDERS=' + r.deletedCount);
  await mongoose.disconnect();
})();
