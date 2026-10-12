const mongoose = require('mongoose');

/* A mod is either mirrored from the Steam Workshop or uploaded to PixelVault
   by a local user. The two are kept visibly distinct: mirrored entries carry
   `source` (where it came from, and when) plus `mirror` (the figures Steam
   itself reports), while locally uploaded entries carry neither. */
const modSchema = new mongoose.Schema({
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
  title: { type: String, required: true },
  tagline: String,
  description: String,
  // required only for locally uploaded mods — a Workshop author is not a PixelVault user
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Provenance. Absent for local uploads.
  source: {
    provider: { type: String, enum: ['steam-workshop'], index: true },
    id: String,          // Steam publishedfileid
    url: String,         // canonical community page for this item
    author: String,      // the author's public Steam name
    authorId: String,    // steamid64, as Steam reports it
    gameUrl: String,     // the Workshop page for the parent game
    retrievedAt: Date,   // when this row was mirrored
  },

  // Figures Steam itself publishes for a Workshop item.
  mirror: {
    subscriptions: Number,
    favorites: Number,
    views: Number,
    votes: Number,
    rating: Number,       // Steam star rating, 0-5
    comments: Number,
    fileSize: Number,     // bytes, as reported by Steam
    createdAt: Date,
    updatedAt: Date,
  },

  // Steam publishes no version string for a Workshop item, so this stays unset
  // for mirrored mods rather than being filled with a placeholder.
  version: String,
  loader: { type: String, enum: ['vaultmod', 'forge-like', 'standalone', 'lua', 'other'] },
  gameVersion: String,
  downloadUrl: String,
  previewImage: String,
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

// one row per mirrored workshop item, re-importable without duplicating
modSchema.index({ 'source.provider': 1, 'source.id': 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Mod', modSchema);