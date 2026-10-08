const mongoose = require('mongoose');

const toySchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, index: true },
  tagline: { type: String, default: '' },
  description: { type: String, default: '' },
  brand: { type: String, default: '' },
  category: { type: String, enum: ['Plush', 'Figure', 'Statue', 'Apparel', 'Book', 'Music', 'Pins', 'Other'], default: 'Other', index: true },
  material: { type: String, default: '' },
  size: { type: String, default: '' },
  age: { type: String, default: '3+' },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, default: 0, min: 0 },
  weightLb: { type: Number, default: 1.0 },
  warehouse: { type: String, default: 'US-EAST' },
  includes: [String],
  coverImage: { type: String, default: '' },
  screenshots: [String],
  sourceUrl: { type: String, default: '' },
  relatedAppId: { type: Number, default: null, index: true },
  status: { type: String, enum: ['published', 'hidden', 'soldout'], default: 'published', index: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  stats: {
    views: { type: Number, default: 0 },
    unitsSold: { type: Number, default: 0 },
    revenueGross: { type: Number, default: 0 },
    reviewSum: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 }
  }
}, { timestamps: true });

toySchema.pre('validate', function (next) {
  if (!this.slug && this.title) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  }
  next();
});

toySchema.index({ title: 'text', tagline: 'text', description: 'text' });
toySchema.index({ price: 1 });

module.exports = mongoose.model('Toy', toySchema);
