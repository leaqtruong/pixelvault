const express = require('express');
const Review = require('../models/Review');
const Game = require('../models/Game');
const User = require('../models/User');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

router.post('/:gameId', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user._id);
  if (!user.ownsGame(req.params.gameId)) return res.status(403).send('You must own the game to review.');
  const entry = user.library.find(e => String(e.game) === String(req.params.gameId));
  try {
    await Review.create({
      game: req.params.gameId, user: user._id,
      stars: Number(req.body.stars), title: req.body.title, body: req.body.body,
      playMinutesAtReview: entry?.playMinutes || 0
    });
    const agg = await Review.aggregate([{ $match: { game: new (require('mongoose').Types.ObjectId)(req.params.gameId) } }, { $group: { _id: null, sum: { $sum: '$stars' }, n: { $sum: 1 } } }]);
    if (agg[0]) await Game.updateOne({ _id: req.params.gameId }, { $set: { 'stats.reviewSum': agg[0].sum, 'stats.reviewCount': agg[0].n } });
  } catch (e) {
    return res.status(400).send('Already reviewed or invalid. <a href="back">Back</a>');
  }
  const g = await Game.findById(req.params.gameId).lean();
  res.redirect(`/games/${g.slug}`);
});

router.post('/:id/helpful', requireLogin, async (req, res) => {
  const r = await Review.findById(req.params.id);
  const uid = req.session.user._id;
  if (r.helpful.map(String).includes(String(uid))) r.helpful.pull(uid); else r.helpful.push(uid);
  await r.save();
  res.redirect('back');
});

// Dev response to review
router.post('/:id/respond', requireLogin, async (req, res) => {
  const r = await Review.findById(req.params.id).populate('game');
  if (!r) return res.status(404).send('Not found');
  if (String(r.game.developer) !== String(req.session.user._id) && req.session.user.role !== 'admin') return res.status(403).send('Only the developer can respond.');
  r.devResponse = { text: req.body.text, respondedAt: new Date() };
  await r.save();
  res.redirect(`/games/${r.game.slug}`);
});

module.exports = router;
