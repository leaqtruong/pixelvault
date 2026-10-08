const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  kind: { type: String, enum: ['game', 'toy'], default: 'game' },
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
  toy: { type: mongoose.Schema.Types.ObjectId, ref: 'Toy', default: null },
  title: String,
  edition: { type: String, enum: ['digital', 'physical', 'deluxe'], default: 'digital' },
  unitPrice: { type: Number, required: true },
  qty: { type: Number, default: 1, min: 1 },
  weightLb: { type: Number, default: 0 },
  keyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'GameKey' }]
}, { _id: false });

const shipmentSchema = new mongoose.Schema({
  tracking: String,
  carrier: { type: String, default: 'VaultPost' },
  method: { type: String, enum: ['standard', 'express', 'overnight'], default: 'standard' },
  cost: { type: Number, default: 0 },
  address: {
    fullName: String, street: String, city: String,
    region: String, postal: String, country: String, phone: String
  },
  status: { type: String, enum: ['packing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'returned'], default: 'packing' },
  shippedAt: Date,
  deliveredAt: Date
}, { _id: false });

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [itemSchema],
  subtotal: Number,
  discountTotal: Number,
  tax: Number,
  shippingTotal: Number,
  grandTotal: Number,
  status: { type: String, enum: ['pending', 'paid', 'fulfilled', 'partially_shipped', 'shipped', 'delivered', 'refunded', 'cancelled'], default: 'paid' },
  payment: {
    method: { type: String, default: 'card' },
    last4: String
  },
  shipment: shipmentSchema,
  devPayouts: [{
    developer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game' },
    gross: Number,
    cut: Number
  }]
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
