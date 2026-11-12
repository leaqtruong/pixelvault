const mongoose = require('mongoose');

/* A developer's payout request. The request zeroes the developer's displayed
   balance so it cannot be requested twice; the admin either marks it paid or
   rejects it (which puts the amount back). */
const payoutSchema = new mongoose.Schema({
  developer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending', 'paid', 'rejected'], default: 'pending', index: true },
  requestedAt: { type: Date, default: Date.now, index: true },
  paidAt: Date,
  note: String,
}, { timestamps: true });

module.exports = mongoose.model('Payout', payoutSchema);
