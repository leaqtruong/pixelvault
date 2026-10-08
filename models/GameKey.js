const mongoose = require('mongoose');

const keySchema = new mongoose.Schema({
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
  batchId: { type: String, default: 'seed', index: true },
  platform: { type: String, enum: ['Steam', 'Epic', 'GOG', 'PixelVault'], default: 'Steam' },
  region: { type: String, default: 'GLOBAL' },
  // AES-256-GCM encrypted payload (iv.tag.data)
  codeEnc: { type: String, required: true },
  // SHA-256 of plaintext for dedupe (never store plaintext)
  codeHash: { type: String, required: true, unique: true },
  status: { type: String, enum: ['available', 'reserved', 'sold', 'revoked'], default: 'available', index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  soldAt: { type: Date, default: null },
}, { timestamps: true });

keySchema.index({ game: 1, status: 1 });

// Atomically claim ONE available key for a game.
// Returns the claimed doc or null when out of stock. Race-safe.
keySchema.statics.claimOne = function (gameId, { orderId = null, userId = null } = {}) {
  return this.findOneAndUpdate(
    { game: gameId, status: 'available' },
    { $set: { status: 'sold', order: orderId, user: userId, soldAt: new Date() } },
    { new: true }
  );
};

keySchema.statics.countAvailable = function (gameId) {
  return this.countDocuments({ game: gameId, status: 'available' });
};

module.exports = mongoose.model('GameKey', keySchema);
