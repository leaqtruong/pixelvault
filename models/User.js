const mongoose = require('mongoose');

const libraryEntrySchema = new mongoose.Schema({
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true },
  edition: { type: String, enum: ['digital', 'physical', 'deluxe'], default: 'digital' },
  purchasedAt: { type: Date, default: Date.now },
  playMinutes: { type: Number, default: 0 },
  lastPlayedAt: { type: Date, default: null },
  achievements: [{ key: String, unlockedAt: Date }],
  completed: { type: Boolean, default: false }
}, { _id: false });

const addressSchema = new mongoose.Schema({
  label: String,
  fullName: String,
  street: String,
  city: String,
  region: String,
  postal: String,
  country: { type: String, default: 'US' },
  phone: String
}, { _id: true });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 24 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'developer', 'admin'], default: 'user' },
  avatar: { type: String, default: '' },
  bio: { type: String, default: '', maxlength: 500 },
  wallet: { type: Number, default: 0 },
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Game' }],
  toyWishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Toy' }],
  library: [libraryEntrySchema],
  toyLibrary: [{
    toy: { type: mongoose.Schema.Types.ObjectId, ref: 'Toy', required: true },
    purchasedAt: { type: Date, default: Date.now },
    qty: { type: Number, default: 1 }
  }],
  addresses: [addressSchema],
  playHistory: [{
    game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game' },
    minutes: Number,
    playedAt: { type: Date, default: Date.now }
  }],
  purchaseHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
  devProfile: {
    studioName: String,
    website: String,
    payoutEmail: String,
    verified: { type: Boolean, default: false },
    balanceOwed: { type: Number, default: 0 }
  },
  preferences: {
    favoriteGenres: [String],
    matureFilter: { type: Boolean, default: false }
  }
}, { timestamps: true });

userSchema.methods.ownsGame = function (gameId) {
  return this.library.some(e => String(e.game) === String(gameId) || String(e.game?._id) === String(gameId));
};

userSchema.methods.totalPlayMinutes = function () {
  return this.library.reduce((s, e) => s + (e.playMinutes || 0), 0);
};

module.exports = mongoose.model('User', userSchema);
