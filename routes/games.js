const express = require('express');
const Game = require('../models/Game');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

// Store front: Steam-style search / filter / sort + pagination
router.get('/', async (req, res) => {
  try {
  const { q, genre, tag, platform, feature, sort = 'popular', maxPrice, onSale, moddable, page = '1', limit = '24' } = req.query;
  const filter = { status: 'published', productType: { $ne: 'toy' } };
  if (genre) filter.genres = genre;
  if (tag) filter.tags = tag;
  if (platform) filter.platforms = platform;
  if (feature) filter.features = feature;
  if (onSale === '1') filter.discountPct = { $gt: 0 };
  if (moddable === '1') filter.modSupport = true;
  if (maxPrice !== undefined && maxPrice !== '') {
    // price filter applied in-memory after discount math (keeps query simple)
  }

  let games = await Game.find(filter).populate('developer', 'username').lean();
  if (q) {
    const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    games = games.filter(g => rx.test(g.title) || rx.test(g.description) || rx.test(g.tagline));
  }
  if (maxPrice !== undefined && maxPrice !== '') {
    const mp = Number(maxPrice);
    if (!Number.isNaN(mp)) games = games.filter(g => (g.price * (1 - (g.discountPct || 0) / 100)) <= mp);
  }

  const sorts = {
    popular: (a, b) => ((b.stats.views || 0) + (b.stats.unitsDigital || 0) * 10) - ((a.stats.views || 0) + (a.stats.unitsDigital || 0) * 10),
    newest: (a, b) => new Date(b.releaseDate) - new Date(a.releaseDate),
    priceAsc: (a, b) => (a.price * (1 - (a.discountPct || 0) / 100)) - (b.price * (1 - (b.discountPct || 0) / 100)),
    priceDesc: (a, b) => (b.price * (1 - (b.discountPct || 0) / 100)) - (a.price * (1 - (a.discountPct || 0) / 100)),
    rating: (a, b) => ((b.stats.reviewCount ? b.stats.reviewSum / b.stats.reviewCount : 0) - (a.stats.reviewCount ? a.stats.reviewSum / a.stats.reviewCount : 0))
  };
  games.sort(sorts[sort] || sorts.popular);

  // Pagination (keeps 100-game catalog fast)
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(60, Math.max(12, parseInt(limit, 10) || 24));
  const total = games.length;
  const totalPages = Math.max(1, Math.ceil(total / lim));
  const safePage = Math.min(pg, totalPages);
  const paged = games.slice((safePage - 1) * lim, safePage * lim);

  const genres = await Game.distinct('genres', { status: 'published' });
  const tags = await Game.distinct('tags', { status: 'published' });
  const { STEAM_GENRES, STEAM_PLATFORMS } = require('../lib/steamTaxonomy');
  res.render('store', { games: paged, genres, tags, total, totalPages, page: safePage, limit: lim, STEAM_GENRES, STEAM_PLATFORMS, query: req.query });
  } catch (e) { res.render('store', { games: [], genres: [], tags: [], total: 0, totalPages: 1, page: 1, limit: 24, STEAM_GENRES: [], STEAM_PLATFORMS: [], query: req.query }); }
});

// Game detail (JSON + HTML)
router.get('/:slug', async (req, res) => {
  try {
  const game = await Game.findOne({ slug: req.params.slug }).populate('developer', 'username').lean();
  if (!game) return res.status(404).send('Game not found');
  if (game.productType === 'toy') return res.redirect(301, `/toys/${game.slug}`);
  await Game.updateOne({ _id: game._id }, { $inc: { 'stats.views': 1 } });

  const Review = require('../models/Review');
  const Mod = require('../models/Mod');
  const Post = require('../models/Post');
  const GameKey = require('../models/GameKey');
  const reviews = await Review.find({ game: game._id }).populate('user', 'username').sort({ createdAt: -1 }).limit(20).lean();
  const mods = await Mod.find({ game: game._id, status: 'published' }).sort({ 'stats.downloads': -1 }).limit(6).lean();
  const threads = await Post.find({ game: game._id }).sort({ createdAt: -1 }).limit(5).populate('author', 'username').lean();
  const keysAvailable = await GameKey.countAvailable(game._id);
  let relatedGame = null;
  if (game.productType === 'toy' && game.toy?.relatedAppId) {
    relatedGame = await Game.findOne({ steamAppId: game.toy.relatedAppId }).lean();
  }

  if (req.query.format === 'json') return res.json({ game, reviews, mods, keysAvailable, relatedGame });
  res.render('game-detail', { game, reviews, mods, threads, keysAvailable, relatedGame });
  } catch (e) { res.status(503).send('Store database offline. Start MongoDB and run npm run seed. <a href="/">Home</a>'); }
});

// Wishlist toggle
router.post('/:id/wishlist', requireLogin, async (req, res) => {
  const User = require('../models/User');
  const user = await User.findById(req.session.user._id);
  const gid = req.params.id;
  const has = user.wishlist.map(String).includes(String(gid));
  if (has) user.wishlist.pull(gid); else user.wishlist.push(gid);
  await user.save();
  res.redirect('back');
});

module.exports = router;
