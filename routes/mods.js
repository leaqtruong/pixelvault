const express = require('express');
const Mod = require('../models/Mod');
const Game = require('../models/Game');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

// Mod hub: browse + filter by game
router.get('/', async (req, res) => {
  try {
  const { game: gameId, q, sort = 'downloads' } = req.query;
  const filter = { status: 'published' };
  if (gameId) filter.game = gameId;
  let mods = await Mod.find(filter).populate('game', 'title coverImage slug').populate('author', 'username').lean();
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    mods = mods.filter(m => rx.test(m.title) || rx.test(m.description));
  }
  const sorts = {
    downloads: (a, b) => b.stats.downloads - a.stats.downloads,
    endorsed: (a, b) => b.stats.endorsements - a.stats.endorsements,
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  };
  mods.sort(sorts[sort] || sorts.downloads);
  const games = await Game.find({ status: 'published', modSupport: true }).select('title').lean();
  res.render('mods', { mods, games, query: req.query });
  } catch (e) { res.render('mods', { mods: [], games: [], query: req.query }); }
});

router.get('/new', requireLogin, async (req, res) => {
  const games = await Game.find({ status: 'published' }).select('title').lean();
  res.render('mod-form', { games, error: null });
});

router.post('/new', requireLogin, async (req, res) => {
  try {
    const mod = await Mod.create({
      game: req.body.game, title: req.body.title, tagline: req.body.tagline,
      description: req.body.description, author: req.session.user._id,
      version: req.body.version || '1.0.0', loader: req.body.loader || 'vaultmod',
      gameVersion: req.body.gameVersion || '1.0.0',
      downloadUrl: req.body.downloadUrl,
      tags: String(req.body.tags || '').split(',').map(s => s.trim()).filter(Boolean)
    });
    res.redirect(`/mods/${mod._id}`);
  } catch (e) {
    const games = await Game.find({ status: 'published' }).select('title').lean();
    res.render('mod-form', { games, error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const mod = await Mod.findById(req.params.id).populate('game', 'title slug coverImage').populate('author', 'username').populate('comments.user', 'username').lean();
  if (!mod) return res.status(404).send('Mod not found');
  await Mod.updateOne({ _id: mod._id }, { $inc: { 'stats.views': 1 } });
  res.render('mod-detail', { mod });
});

router.post('/:id/download', async (req, res) => {
  await Mod.updateOne({ _id: req.params.id }, { $inc: { 'stats.downloads': 1 } });
  const mod = await Mod.findById(req.params.id).lean();
  res.redirect(mod?.downloadUrl || '/mods');
});

router.post('/:id/endorse', requireLogin, async (req, res) => {
  const mod = await Mod.findById(req.params.id);
  const uid = req.session.user._id;
  if (mod.endorsedBy.map(String).includes(String(uid))) mod.endorsedBy.pull(uid);
  else mod.endorsedBy.push(uid);
  mod.stats.endorsements = mod.endorsedBy.length;
  await mod.save();
  res.redirect(`/mods/${mod._id}`);
});

router.post('/:id/comment', requireLogin, async (req, res) => {
  await Mod.updateOne({ _id: req.params.id }, { $push: { comments: { user: req.session.user._id, text: req.body.text } } });
  res.redirect(`/mods/${req.params.id}`);
});

module.exports = router;
