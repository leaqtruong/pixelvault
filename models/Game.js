const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, index: true },
  tagline: { type: String, default: '' },
  description: { type: String, default: '' },
  developer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studioName: { type: String, default: 'Indie' },
  genres: [{ type: String, index: true }],
  tags: [String],
  platforms: [{ type: String, enum: ['Windows', 'Mac', 'Linux', 'Steam Deck', 'VR'], default: 'Windows' }],
  features: [String],
  coverImage: { type: String, default: '' },
  screenshots: [String],
  trailerUrl: { type: String, default: '' },
  price: { type: Number, required: true, min: 0 },
  discountPct: { type: Number, default: 0, min: 0, max: 90 },
  // digital fulfilment
  digitalSku: String,
  steamAppId: { type: Number, index: true, sparse: true },
  // product type: game (digital key) vs toy (physical merch)
  productType: { type: String, enum: ['game', 'toy'], default: 'game', index: true },
  toy: {
    brand: { type: String, default: '' },
    category: { type: String, enum: ['Plush', 'Figure', 'Statue', 'Apparel', 'Book', 'Music', 'Pins', 'Other'], default: 'Other' },
    material: { type: String, default: '' },
    size: { type: String, default: '' },
    age: { type: String, default: '3+' },
    relatedAppId: { type: Number, default: null }
  },
  sourceUrl: { type: String, default: '' },
  fileSizeGB: Number,
  version: { type: String, default: '1.0.0' },
  // physical edition
  physical: {
    enabled: { type: Boolean, default: false },
    price: { type: Number, default: 0 },
    stock: { type: Number, default: 0 },
    weightLb: { type: Number, default: 0.4 },
    warehouse: { type: String, default: 'US-EAST' },
    includes: [String]
  },
  systemReq: {
    os: String, cpu: String, ram: String, gpu: String, storage: String
  },
  rating: { type: String, enum: ['E', 'E10+', 'T', 'M', 'AO'], default: 'E' },
  status: { type: String, enum: ['draft', 'pending', 'published', 'rejected', 'delisted'], default: 'pending', index: true },
  featured: { type: Boolean, default: false },
  releaseDate: { type: Date, default: Date.now },
  modSupport: { type: Boolean, default: true },
  stats: {
    views: { type: Number, default: 0 },
    unitsDigital: { type: Number, default: 0 },
    unitsPhysical: { type: Number, default: 0 },
    revenueGross: { type: Number, default: 0 },
    reviewSum: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    keysAvailable: { type: Number, default: 0 },
    keysSold: { type: Number, default: 0 }
  }
}, { timestamps: true });

gameSchema.virtual('salePrice').get(function () {
  return +(this.price * (1 - (this.discountPct || 0) / 100)).toFixed(2);
});

gameSchema.virtual('avgRating').get(function () {
  if (!this.stats.reviewCount) return 0;
  return +(this.stats.reviewSum / this.stats.reviewCount).toFixed(1);
});

gameSchema.pre('validate', function (next) {
  if (!this.slug && this.title) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  }
  next();
});

gameSchema.set('toJSON', { virtuals: true });
gameSchema.set('toObject', { virtuals: true });

gameSchema.index({ title: 'text', tagline: 'text', description: 'text' });
gameSchema.index({ price: 1, discountPct: 1 });
gameSchema.index({ platforms: 1 });
gameSchema.index({ releaseDate: -1 });

module.exports = mongoose.model('Game', gameSchema);
