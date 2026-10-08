const mongoose = require('mongoose');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/pixelvault');
  const r = await mongoose.connection.db.collection('games').updateMany({}, { $set: { 'stats.reviewSum': 0, 'stats.reviewCount': 0 } });
  console.log('BLANKED_REVIEWS=' + r.modifiedCount);
  const d = await mongoose.connection.db.collection('reviews').deleteMany({});
  console.log('CLEARED_SEED_REVIEWS=' + d.deletedCount);
  await mongoose.disconnect();
})();
