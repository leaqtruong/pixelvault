const mongoose = require('mongoose');
mongoose.set('bufferTimeoutMS', 2500);

async function connectDB(uri) {
  if (!uri) {
    console.log('[db] No MONGO_URI set — running without database (pages will show empty states).');
    return false;
  }
  try {
    await mongoose.connect(uri);
    console.log('[db] Connected to MongoDB');
    return true;
  } catch (err) {
    console.error('[db] MongoDB connection failed:', err.message);
    console.error('[db] Server still runs, but store data will be empty until DB is reachable.');
    return false;
  }
}

module.exports = connectDB;
