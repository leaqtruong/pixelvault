const express = require('express');
const Post = require('../models/Post');
const Game = require('../models/Game');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

const BOARDS = [
  { id: 'general', name: 'General Tavern', desc: 'Anything vault-related' },
  { id: 'lfg', name: 'Looking For Group', desc: 'Find co-op squads' },
  { id: 'guides', name: 'Guides & Builds', desc: 'Share strats' },
  { id: 'support', name: 'Tech Support', desc: 'Bugs, installs, shipping' },
  { id: 'deals', name: 'Deals Watch', desc: 'Price drops + bundles' },
  { id: 'game', name: 'Game Boards', desc: 'Per-title discussion' }
];

// Board index
router.get('/', async (req, res) => {
  try {
  const counts = await Post.aggregate([{ $group: { _id: '$board', n: { $sum: 1 } } }]);
  const countMap = Object.fromEntries(counts.map(c => [c._id, c.n]));
  const latest = await Post.find().sort({ createdAt: -1 }).limit(8).populate('author', 'username').lean();
  res.render('community', { BOARDS, countMap, latest });
  } catch (e) { res.render('community', { BOARDS, countMap: {}, latest: [] }); }
});

// Single board (or per-game)
router.get('/b/:board', async (req, res) => {
  const { board } = req.params;
  const filter = { board };
  if (req.query.game) filter.game = req.query.game;
  if (req.query.q) filter.title = new RegExp(req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const posts = await Post.find(filter).populate('author', 'username').populate('game', 'title').sort({ pinned: -1, updatedAt: -1 }).limit(50).lean();
  const games = await Game.find({ status: 'published' }).select('title').lean();
  res.render('board', { board, posts, games, query: req.query });
});

router.get('/new', requireLogin, async (req, res) => {
  const games = await Game.find({ status: 'published' }).select('title').lean();
  res.render('post-form', { BOARDS, games, error: null });
});

router.post('/new', requireLogin, async (req, res) => {
  try {
    const post = await Post.create({
      board: req.body.board || 'general',
      game: req.body.game || null,
      title: req.body.title, body: req.body.body,
      author: req.session.user._id,
      tags: String(req.body.tags || '').split(',').map(s => s.trim()).filter(Boolean)
    });
    res.redirect(`/community/p/${post._id}`);
  } catch (e) {
    const games = await Game.find({ status: 'published' }).select('title').lean();
    res.render('post-form', { BOARDS, games, error: e.message });
  }
});

router.get('/p/:id', async (req, res) => {
  const post = await Post.findById(req.params.id).populate('author', 'username').populate('game', 'title slug').populate('replies.user', 'username').lean();
  if (!post) return res.status(404).send('Thread not found');
  await Post.updateOne({ _id: post._id }, { $inc: { views: 1 } });
  res.render('post-detail', { post });
});

router.post('/p/:id/reply', requireLogin, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).send('Not found');
  if (post.locked && req.session.user.role !== 'admin') return res.status(403).send('Thread locked');
  post.replies.push({ user: req.session.user._id, text: req.body.text });
  await post.save();
  res.redirect(`/community/p/${post._id}`);
});

router.post('/p/:id/like', requireLogin, async (req, res) => {
  const post = await Post.findById(req.params.id);
  const uid = req.session.user._id;
  if (post.likes.map(String).includes(String(uid))) post.likes.pull(uid);
  else post.likes.push(uid);
  await post.save();
  res.redirect(`/community/p/${post._id}`);
});

module.exports = router;
