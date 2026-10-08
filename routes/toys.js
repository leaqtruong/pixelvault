const express = require('express');
const Toy = require('../models/Toy');
const Game = require('../models/Game');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

// Toy storefront: search / filter / sort + pagination
router.get('/', async (req, res) => {
  try {
    const { q, category, brand, sort = 'popular', page = '1', limit = '24' } = req.query;
    const filter = { status: 'published' };
    if (category) filter.category = category;
    if (brand) filter.brand = brand;

    let toys = await Toy.find(filter).lean();
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      toys = toys.filter((t) => rx.test(t.title) || rx.test(t.description) || rx.test(t.tagline) || rx.test(t.brand));
    }
    const sorts = {
      popular: (a, b) => ((b.stats.views || 0) + (b.stats.unitsSold || 0) * 10) - ((a.stats.views || 0) + (a.stats.unitsSold || 0) * 10),
      newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      priceAsc: (a, b) => a.price - b.price,
      priceDesc: (a, b) => b.price - a.price,
    };
    toys.sort(sorts[sort] || sorts.popular);

    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(60, Math.max(12, parseInt(limit, 10) || 24));
    const total = toys.length;
    const totalPages = Math.max(1, Math.ceil(total / lim));
    const safePage = Math.min(pg, totalPages);
    const paged = toys.slice((safePage - 1) * lim, safePage * lim);

    const categories = await Toy.distinct('category', { status: 'published' });
    const brands = await Toy.distinct('brand', { status: 'published' });
    res.render('toys', { toys: paged, categories, brands, total, totalPages, page: safePage, limit: lim, query: req.query });
  } catch (e) {
    res.render('toys', { toys: [], categories: [], brands: [], total: 0, totalPages: 1, page: 1, limit: 24, query: req.query });
  }
});

// Toy detail
router.get('/:slug', async (req, res) => {
  try {
    const toy = await Toy.findOne({ slug: req.params.slug }).lean();
    if (!toy) return res.status(404).send('Collectible not found');
    await Toy.updateOne({ _id: toy._id }, { $inc: { 'stats.views': 1 } });
    let relatedGame = null;
    if (toy.relatedAppId) relatedGame = await Game.findOne({ steamAppId: toy.relatedAppId }).lean();
    if (req.query.format === 'json') return res.json({ toy, relatedGame });
    res.render('toy-detail', { toy, relatedGame });
  } catch (e) {
    res.status(503).send('Store database offline. <a href="/">Home</a>');
  }
});

// Toy wishlist toggle
router.post('/:id/wishlist', requireLogin, async (req, res) => {
  const User = require('../models/User');
  const user = await User.findById(req.session.user._id);
  const tid = req.params.id;
  const has = (user.toyWishlist || []).map(String).includes(String(tid));
  if (has) user.toyWishlist.pull(tid); else user.toyWishlist.push(tid);
  await user.save();
  res.redirect('back');
});

module.exports = router;
