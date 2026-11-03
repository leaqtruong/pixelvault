const mongoose = require('mongoose');
const { encryptKey, hashKey } = require('../lib/keyCrypto');

/* One document per key that has actually been handed to a buyer.
 *
 * This collection is a record of what was issued, not a shelf to pick from.
 * There is no 'available' state: a document only comes into existence at the
 * moment an order is fulfilled, so "how many keys are in stock" was never a
 * meaningful question and the counter that pretended to answer it is gone.
 *
 * codeEnc still holds the AES-256-GCM payload (iv.tag.data) and codeHash is the
 * SHA-256 of the plaintext, unique, so the same key can never be issued twice
 * even if a supplier hands one out by mistake.
 */
const keySchema = new mongoose.Schema({
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
  platform: { type: String, enum: ['Steam', 'Epic', 'GOG', 'PixelVault'], default: 'Steam' },
  region: { type: String, default: 'GLOBAL' },
  // which path produced this key: a real supplier, or a locally generated
  // DEMO placeholder. Stored so it is never ambiguous after the fact.
  source: { type: String, enum: ['supplier', 'demo'], default: 'demo', index: true },
  codeEnc: { type: String, required: true },
  codeHash: { type: String, required: true, unique: true },
  status: { type: String, enum: ['sold', 'revoked'], default: 'sold', index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  soldAt: { type: Date, default: null },
}, { timestamps: true });

keySchema.index({ game: 1, status: 1 });
keySchema.index({ user: 1, createdAt: -1 });

/* Record one issued key. Throws on a duplicate codeHash, which is the point:
   two orders can never end up holding the same key. */
keySchema.statics.issue = function (gameId, plain, { orderId = null, userId = null, source = 'demo' } = {}) {
  return this.create({
    game: gameId,
    source,
    codeEnc: encryptKey(plain),
    codeHash: hashKey(plain),
    status: 'sold',
    order: orderId,
    user: userId,
    soldAt: new Date(),
  });
};

/* Keys this buyer already holds, newest first. Drives the library page. */
keySchema.statics.listForUser = function (userId) {
  return this.find({ user: userId, status: 'sold' }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('GameKey', keySchema);
