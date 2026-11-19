const mongoose = require('mongoose');

const slugify = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const genreSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  sortOrder: { type: Number, default: 0, index: true },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

genreSchema.pre('validate', function (next) {
  if (!this.slug && this.name) this.slug = slugify(this.name);
  next();
});

genreSchema.index({ active: 1, sortOrder: 1, name: 1 });

genreSchema.statics.slugify = slugify;

module.exports = mongoose.model('Genre', genreSchema);
