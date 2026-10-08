const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stars: { type: Number, min: 1, max: 5, required: true },
  title: String,
  body: { type: String, maxlength: 4000 },
  playMinutesAtReview: { type: Number, default: 0 },
  helpful: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  devResponse: {
    text: String,
    respondedAt: Date
  }
}, { timestamps: true });

reviewSchema.index({ game: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
