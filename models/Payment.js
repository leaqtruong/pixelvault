const mongoose = require('mongoose');

/* One row per checkout attempt, created before the shopper leaves for the
   gateway and settled afterwards. The unique orderId is what makes settlement
   idempotent: only the callback that first moves status from 'pending' wins,
   and every later callback — the browser redirect plus the gateway's IPN, or a
   double-click — finds nothing to update and reports "already settled". */
const paymentSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },   // our reference
  gatewayOrderId: String,                                   // vnp_TxnRef we send out
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },

  amount: { type: Number, required: true },
  currency: { type: String, default: 'VND' },
  description: String,

  provider: { type: String, enum: ['vnpay', 'sandbox'], required: true },
  // 'sandbox' moves no money. It exists so the full flow can be demonstrated
  // on a machine with no merchant account, using the same signing and
  // verification code a live gateway uses.
  live: { type: Boolean, default: false },

  status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
  responseCode: String,
  gatewayTransactionNo: String,
  bankCode: String,

  // the exact fields the gateway sent back, kept for dispute handling
  rawCallback: { type: mongoose.Schema.Types.Mixed },
  settledAt: Date,
  failureReason: String,
}, { timestamps: true });

// settlement always looks a payment up by gateway reference
paymentSchema.index({ gatewayOrderId: 1 });

/* Claim the settlement. Returns the winning document, or null when another
   callback already took it. Single-document findOneAndUpdate, so it is atomic
   without needing a replica set transaction. */
paymentSchema.statics.claim = function (orderId, patch) {
  return this.findOneAndUpdate(
    { orderId, status: 'pending' },
    { $set: { status: patch.status, responseCode: patch.responseCode || '', gatewayTransactionNo: patch.gatewayTransactionNo || '', rawCallback: patch.rawCallback || {}, settledAt: patch.status === 'pending' ? undefined : new Date(), failureReason: patch.failureReason || '' } },
    { new: true },
  );
};

module.exports = mongoose.model('Payment', paymentSchema);