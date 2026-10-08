const mongoose = require('mongoose');
mongoose.set('bufferTimeoutMS', 30000);

let connected = false;

async function tryOnce(uri) {
  await mongoose.connect(uri);
  connected = true;
  console.log('[db] Connected to MongoDB');
}

async function connectDB(uri) {
  if (!uri) {
    console.log('[db] No MONGO_URI set — running without database (pages will show empty states).');
    return false;
  }
  // Retry forever: the web server often boots before MongoDB is up.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tryOnce(uri);
      return true;
    } catch (err) {
      console.error('[db] MongoDB unreachable, retrying in 5s:', err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

module.exports = connectDB;
