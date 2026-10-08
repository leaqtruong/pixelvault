const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: { type: String, required: true, maxlength: 4000 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

const postSchema = new mongoose.Schema({
  board: { type: String, enum: ['general', 'lfg', 'guides', 'support', 'deals', 'game'], default: 'general', index: true },
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
  title: { type: String, required: true, maxlength: 160 },
  body: { type: String, required: true, maxlength: 12000 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tags: [String],
  pinned: { type: Boolean, default: false },
  locked: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  replies: [replySchema]
}, { timestamps: true });

module.exports = mongoose.model('Post', postSchema);
