const mongoose = require('mongoose');

const modSchema = new mongoose.Schema({
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
  title: { type: String, required: true },
  tagline: String,
  description: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  version: { type: String, default: '1.0.0' },
  loader: { type: String, enum: ['vaultmod', 'forge-like', 'standalone', 'lua', 'other'], default: 'vaultmod' },
  gameVersion: { type: String, default: '1.0.0' },
  downloadUrl: String,
  screenshots: [String],
  tags: [String],
  stats: {
    downloads: { type: Number, default: 0 },
    endorsements: { type: Number, default: 0 },
    views: { type: Number, default: 0 }
  },
  endorsedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    text: { type: String, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now }
  }],
  status: { type: String, enum: ['pending', 'published', 'hidden'], default: 'published' }
}, { timestamps: true });

module.exports = mongoose.model('Mod', modSchema);
