const mongoose = require('mongoose');

/* Shared GridFS bucket for media. Mongoose re-exports the underlying mongodb
   driver as mongoose.mongo, so this works without pulling in a second copy of
   the driver. The bucket is lazy: it only exists once the connection is open. */
let bucket = null;

function getBucket() {
  if (!bucket) {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'images' });
  }
  return bucket;
}

module.exports = { getBucket };
