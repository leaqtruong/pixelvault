const express = require('express');
const User = require('../models/User');
const Game = require('../models/Game');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

// Library: owned games + playtime + delivered keys + collectibles
router.get('/', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user._id)
    .populate('library.game')
    .populate('wishlist')
    .populate('toyLibrary.toy')
    .populate('toyWishlist')
    .lean();
  const totalMinutes = (user.library || []).reduce((s, e) => s + (e.playMinutes || 0), 0);
  const GameKey = require('../models/GameKey');
  const keys = await GameKey.find({ user: req.session.user._id, status: 'sold' }).populate('game', 'title slug').lean();
  let plainById = {};
  try {
    const { decryptKey } = require('../lib/keyCrypto');
    keys.forEach(k => { try { plainById[String(k._id)] = decryptKey(k.codeEnc); } catch {} });
  } catch {}
  // group keys by game id for easy render
  const keysByGame = {};
  keys.forEach(k => {
    const gid = String(k.game?._id || k.game);
    (keysByGame[gid] = keysByGame[gid] || []).push(k);
  });
  res.render('library', { user, totalMinutes, keysByGame, plainById });
});

// Simulate a play session (+30 min), records history
router.post('/play/:gameId', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user._id);
  const entry = user.library.find(e => String(e.game) === String(req.params.gameId));
  if (!entry) return res.status(404).send('Not in library');
  entry.playMinutes += 30;
  entry.lastPlayedAt = new Date();
  user.playHistory.push({ game: entry.game, minutes: 30 });
  // achievement stub: first hour + 10 hours
  if (entry.playMinutes >= 60 && !entry.achievements.some(a => a.key === 'first-hour')) entry.achievements.push({ key: 'first-hour', unlockedAt: new Date() });
  if (entry.playMinutes >= 600 && !entry.achievements.some(a => a.key === 'marathon')) entry.achievements.push({ key: 'marathon', unlockedAt: new Date() });
  await user.save();
  res.redirect('/library');
});

// Recommendations based on owned genres
router.get('/recommendations', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user._id).populate('library.game').lean();
  const genreCount = {};
  (user.library || []).forEach(e => (e.game?.genres || []).forEach(g => { genreCount[g] = (genreCount[g] || 0) + 1; }));
  const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
  const ownedIds = (user.library || []).map(e => String(e.game?._id || e.game));
  let recs = await Game.find({ status: 'published', genres: { $in: topGenres.length ? topGenres : ['Action'] } }).lean();
  recs = recs.filter(g => !ownedIds.includes(String(g._id))).slice(0, 8);
  if (req.query.format === 'json') return res.json({ topGenres, recs });
  res.render('recommendations', { topGenres, recs });
});

module.exports = router;
