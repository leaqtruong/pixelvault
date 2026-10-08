// JSON API for the React SPA. Mirrors the EJS routes' logic, session-authenticated.
const express = require('express');
const Game = require('../models/Game');
const GameKey = require('../models/GameKey');
const Order = require('../models/Order');
const User = require('../models/User');
const Toy = require('../models/Toy');
const Review = require('../models/Review');
const Mod = require('../models/Mod');
const Post = require('../models/Post');
const { decryptKey } = require('../lib/keyCrypto');

const router = express.Router();

const needLogin = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });
  next();
};
const needDev = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });
  if (!['developer', 'admin'].includes(req.session.user.role)) return res.status(403).json({ error: 'Developer required' });
  next();
};
const me = (req) => (req.session.user ? { _id: req.session.user._id, username: req.session.user.username, role: req.session.user.role, email: req.session.user.email } : null);

// ---------- auth ----------
router.post('/auth/register', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'All fields required.' });
    const exists = await User.findOne({ $or: [{ email: String(email).toLowerCase() }, { username }] });
    if (exists) return res.status(400).json({ error: 'Username or email taken.' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email: String(email).toLowerCase(), passwordHash });
    req.session.user = { _id: user._id, username: user.username, role: user.role, email: user.email };
    res.json({ user: me(req) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/auth/login', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });
    req.session.user = { _id: user._id, username: user.username, role: user.role, email: user.email };
    res.json({ user: me(req) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
router.get('/auth/me', (req, res) => res.json({ user: me(req) }));

function paginate(list, page, limit) {
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(60, Math.max(1, parseInt(limit, 10) || 24));
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / lim));
  const safePage = Math.min(pg, totalPages);
  return { items: list.slice((safePage - 1) * lim, safePage * lim), total, totalPages, page: safePage, limit: lim };
}

// ---------- games ----------
router.get('/games', async (req, res) => {
  try {
    const { q, genre, tag, platform, feature, sort = 'popular', maxPrice, onSale, moddable, page = '1', limit = '24' } = req.query;
    const filter = { status: 'published', productType: { $ne: 'toy' } };
    if (genre) filter.genres = genre;
    if (tag) filter.tags = tag;
    if (platform) filter.platforms = platform;
    if (feature) filter.features = feature;
    if (onSale === '1') filter.discountPct = { $gt: 0 };
    if (moddable === '1') filter.modSupport = true;
    // Honor the viewer's "hide mature titles" setting.
    try {
      const viewer = req.session.user ? await User.findById(req.session.user._id).lean() : null;
      if (viewer?.preferences?.matureFilter) filter.rating = { $nin: ['M', 'AO'] };
    } catch {}
    let games = await Game.find(filter).populate('developer', 'username').lean();
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      games = games.filter((g) => rx.test(g.title) || rx.test(g.description) || rx.test(g.tagline));
    }
    if (maxPrice !== undefined && maxPrice !== '') {
      const mp = Number(maxPrice);
      if (!Number.isNaN(mp)) games = games.filter((g) => g.price * (1 - (g.discountPct || 0) / 100) <= mp);
    }
    const sorts = {
      popular: (a, b) => (b.stats.views + b.stats.unitsDigital * 10) - (a.stats.views + a.stats.unitsDigital * 10),
      newest: (a, b) => new Date(b.releaseDate) - new Date(a.releaseDate),
      priceAsc: (a, b) => a.price * (1 - (a.discountPct || 0) / 100) - (b.price * (1 - (b.discountPct || 0) / 100)),
      priceDesc: (a, b) => b.price * (1 - (b.discountPct || 0) / 100) - (a.price * (1 - (a.discountPct || 0) / 100)),
      rating: (a, b) => (b.stats.reviewCount ? b.stats.reviewSum / b.stats.reviewCount : 0) - (a.stats.reviewCount ? a.stats.reviewSum / a.stats.reviewCount : 0),
    };
    games.sort(sorts[sort] || sorts.popular);
    const { items, total, totalPages, page: pg, limit: lim } = paginate(games, page, limit);
    const genres = await Game.distinct('genres', { status: 'published', productType: { $ne: 'toy' } });
    const tags = await Game.distinct('tags', { status: 'published', productType: { $ne: 'toy' } });
    res.json({ games: items, total, totalPages, page: pg, limit: lim, genres, tags });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/games/:slug', async (req, res) => {
  try {
    const game = await Game.findOne({ slug: req.params.slug }).populate('developer', 'username').lean();
    if (!game) return res.status(404).json({ error: 'Game not found' });
    await Game.updateOne({ _id: game._id }, { $inc: { 'stats.views': 1 } });
    const reviews = await Review.find({ game: game._id }).populate('user', 'username').sort({ createdAt: -1 }).limit(20).lean();
    const mods = await Mod.find({ game: game._id, status: 'published' }).sort({ 'stats.downloads': -1 }).limit(6).lean();
    const threads = await Post.find({ game: game._id }).sort({ createdAt: -1 }).limit(5).populate('author', 'username').lean();
    const keysAvailable = await GameKey.countAvailable(game._id);
    res.json({ game, reviews, mods, threads, keysAvailable });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/games/:id/wishlist', needLogin, async (req, res) => {
  const user = await User.findById(req.session.user._id);
  const gid = req.params.id;
  const has = user.wishlist.map(String).includes(String(gid));
  if (has) user.wishlist.pull(gid); else user.wishlist.push(gid);
  await user.save();
  res.json({ wishlisted: !has });
});

// ---------- toys ----------
router.get('/toys', async (req, res) => {
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
      popular: (a, b) => (b.stats.views + b.stats.unitsSold * 10) - (a.stats.views + a.stats.unitsSold * 10),
      newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      priceAsc: (a, b) => a.price - b.price,
      priceDesc: (a, b) => b.price - a.price,
    };
    toys.sort(sorts[sort] || sorts.popular);
    const { items, total, totalPages, page: pg, limit: lim } = paginate(toys, page, limit);
    const categories = await Toy.distinct('category', { status: 'published' });
    const brands = await Toy.distinct('brand', { status: 'published' });
    res.json({ toys: items, total, totalPages, page: pg, limit: lim, categories, brands });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/toys/:slug', async (req, res) => {
  try {
    const toy = await Toy.findOne({ slug: req.params.slug }).lean();
    if (!toy) return res.status(404).json({ error: 'Collectible not found' });
    await Toy.updateOne({ _id: toy._id }, { $inc: { 'stats.views': 1 } });
    let relatedGame = null;
    if (toy.relatedAppId) relatedGame = await Game.findOne({ steamAppId: toy.relatedAppId }).lean();
    res.json({ toy, relatedGame });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/toys/:id/wishlist', needLogin, async (req, res) => {
  const user = await User.findById(req.session.user._id);
  const tid = req.params.id;
  const has = (user.toyWishlist || []).map(String).includes(String(tid));
  if (has) user.toyWishlist.pull(tid); else user.toyWishlist.push(tid);
  await user.save();
  res.json({ wishlisted: !has });
});

// ---------- home ----------
router.get('/home', async (req, res) => {
  try {
    const featured = await Game.find({ status: 'published', productType: { $ne: 'toy' }, featured: true }).limit(5).lean();
    const deals = await Game.find({ status: 'published', productType: { $ne: 'toy' }, discountPct: { $gt: 0 } }).sort({ discountPct: -1 }).limit(8).lean();
    const fresh = await Game.find({ status: 'published', productType: { $ne: 'toy' } }).sort({ releaseDate: -1 }).limit(8).lean();
    const threads = await Post.find().sort({ createdAt: -1 }).limit(5).populate('author', 'username').lean();
    const toys = await Toy.find({ status: 'published' }).limit(4).lean();
    const catNames = ['Action', 'RPG', 'Strategy', 'Indie', 'Adventure', 'Simulation', 'Horror', 'Free to Play'];
    const catTiles = [];
    for (const c of catNames) {
      const g = await Game.findOne({ status: 'published', productType: { $ne: 'toy' }, genres: c }).lean();
      if (g) catTiles.push({ name: c, img: g.coverImage, slug: g.slug });
    }
    res.json({ featured, deals, fresh, threads, toys, catTiles });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- cart ----------
const getCart = (req) => { if (!req.session.cart) req.session.cart = []; return req.session.cart; };

router.get('/cart', async (req, res) => {
  const items = getCart(req);
  for (const i of items) {
    if ((i.kind || 'game') === 'toy') {
      const t = await Toy.findById(i.toyId).lean();
      if (t) { i.title = t.title; i.coverImage = t.coverImage; i.unitPrice = t.price; i.weightLb = t.weightLb || 1.0; i.stock = t.stock; }
    } else {
      const g = await Game.findById(i.gameId).lean();
      if (g) {
        i.title = g.title; i.coverImage = g.coverImage;
        i.unitPrice = i.edition === 'physical' ? g.physical.price || g.price + 15 : +(g.price * (1 - g.discountPct / 100)).toFixed(2);
        i.weightLb = i.edition === 'physical' ? g.physical.weightLb || 0.5 : 0;
        i.stock = g.physical.stock;
      }
    }
  }
  res.json({ items, subtotal: +items.reduce((s, i) => s + i.unitPrice * i.qty, 0).toFixed(2) });
});

router.post('/cart/add', async (req, res) => {
  const { gameId, toyId, edition = 'digital', qty = 1 } = req.body;
  const items = getCart(req);
  if (toyId) {
    const t = await Toy.findById(toyId);
    if (!t || t.status !== 'published') return res.status(404).json({ error: 'Collectible not found' });
    if ((t.stock || 0) < Number(qty)) return res.status(400).json({ error: `Only ${t.stock} left in stock.` });
    const key = `toy:${toyId}`;
    const found = items.find((i) => i.key === key);
    if (found) found.qty = Math.min(9, found.qty + Number(qty));
    else items.push({ key, kind: 'toy', toyId: String(t._id), title: t.title, coverImage: t.coverImage, edition: 'physical', qty: Number(qty), unitPrice: t.price, weightLb: t.weightLb || 1.0 });
    return res.json({ ok: true, items });
  }
  const g = await Game.findById(gameId);
  if (!g) return res.status(404).json({ error: 'Game not found' });
  if (edition === 'physical' && (!g.physical.enabled || g.physical.stock < Number(qty))) return res.status(400).json({ error: 'Physical edition out of stock.' });
  if (edition !== 'physical' && (g.price || 0) > 0) {
    const avail = await GameKey.countAvailable(g._id);
    if (avail < Number(qty)) return res.status(400).json({ error: `Out of digital keys (${avail} left).` });
  }
  const key = `game:${gameId}:${edition}`;
  const found = items.find((i) => i.key === key);
  const unitPrice = edition === 'physical' ? g.physical.price || g.price + 15 : +(g.price * (1 - g.discountPct / 100)).toFixed(2);
  if (found) found.qty = Math.min(9, found.qty + Number(qty));
  else items.push({ key, kind: 'game', gameId: String(g._id), title: g.title, coverImage: g.coverImage, edition, qty: Number(qty), unitPrice, weightLb: edition === 'physical' ? g.physical.weightLb || 0.5 : 0 });
  res.json({ ok: true, items });
});

router.post('/cart/remove', (req, res) => {
  req.session.cart = getCart(req).filter((i) => i.key !== req.body.key);
  res.json({ ok: true, items: req.session.cart });
});

router.post('/cart/qty', (req, res) => {
  const item = getCart(req).find((i) => i.key === req.body.key);
  if (item) item.qty = Math.max(1, Math.min(9, Number(req.body.qty)));
  res.json({ ok: true, items: getCart(req) });
});

// ---------- checkout & orders ----------
const TAX_RATE = Number(process.env.TAX_RATE || 0.08);
const DEV_CUT = Number(process.env.DEV_REVENUE_CUT || 0.7);
function shippingQuote(items, method) {
  const weight = items.reduce((s, i) => s + (i.weightLb || 0) * i.qty, 0);
  const hasPhysical = items.some((i) => i.edition === 'physical' || (i.kind || 'game') === 'toy');
  if (!hasPhysical) return { cost: 0, weight };
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  let cost = 0;
  if (method === 'standard') cost = subtotal > 75 ? 0 : 4.99 + weight * 0.5;
  if (method === 'express') cost = 14.99 + weight * 1.2;
  if (method === 'overnight') cost = 29.99 + weight * 1.8;
  return { cost: +cost.toFixed(2), weight: +weight.toFixed(2) };
}

router.get('/checkout/quote', (req, res) => res.json(shippingQuote(getCart(req), req.query.method || 'standard')));
router.get('/checkout/summary', needLogin, async (req, res) => {
  const items = getCart(req);
  const method = req.query.method || 'standard';
  const { cost } = shippingQuote(items, method);
  const subtotal = +items.reduce((s, i) => s + i.unitPrice * i.qty, 0).toFixed(2);
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const user = await User.findById(req.session.user._id).lean();
  res.json({ items, subtotal, tax, shipCost: cost, grand: +(subtotal + tax + cost).toFixed(2), method, addresses: user.addresses || [] });
});

router.post('/checkout/place', needLogin, async (req, res) => {
  const items = getCart(req);
  if (!items.length) return res.status(400).json({ error: 'Cart is empty' });
  const { method = 'standard', fullName, street, city, region, postal, country = 'US', phone, cardLast4 = '4242' } = req.body;
  const hasPhysical = items.some((i) => i.edition === 'physical' || (i.kind || 'game') === 'toy');
  if (hasPhysical && (!fullName || !street || !city || !postal)) return res.status(400).json({ error: 'Shipping address incomplete.' });
  const subtotal = +items.reduce((s, i) => s + i.unitPrice * i.qty, 0).toFixed(2);
  const { cost: shipCost } = shippingQuote(items, method);
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const grandTotal = +(subtotal + tax + shipCost).toFixed(2);
  const orderItems = []; const devPayouts = []; const claimedKeyIds = [];
  const decPhys = []; const decToys = [];
  try {
    for (const i of items) {
      if ((i.kind || 'game') === 'toy') {
        const t = await Toy.findOneAndUpdate({ _id: i.toyId, stock: { $gte: i.qty } }, { $inc: { stock: -i.qty, 'stats.unitsSold': i.qty } }, { new: true });
        if (!t) throw new Error(`${i.title} is out of stock.`);
        decToys.push({ toyId: t._id, qty: i.qty });
        const gross = +(i.unitPrice * i.qty).toFixed(2);
        t.stats.revenueGross = +((t.stats.revenueGross || 0) + gross).toFixed(2);
        await t.save();
        orderItems.push({ kind: 'toy', toy: t._id, title: t.title, edition: 'physical', unitPrice: i.unitPrice, qty: i.qty, weightLb: i.weightLb || 0, keyIds: [] });
        continue;
      }
      const g = await Game.findById(i.gameId);
      if (!g) continue;
      let keyIds = [];
      if (i.edition === 'physical') {
        const updated = await Game.findOneAndUpdate({ _id: g._id, 'physical.stock': { $gte: i.qty } }, { $inc: { 'physical.stock': -i.qty, 'stats.unitsPhysical': i.qty } }, { new: true });
        if (!updated) throw new Error(`${g.title} physical stock insufficient.`);
        decPhys.push({ gameId: g._id, qty: i.qty });
      } else if (i.unitPrice > 0) {
        for (let k = 0; k < i.qty; k++) {
          const claimed = await GameKey.claimOne(g._id, { userId: req.session.user._id });
          if (!claimed) throw new Error(`${g.title} is out of digital keys.`);
          claimedKeyIds.push(claimed._id); keyIds.push(claimed._id);
        }
        await Game.updateOne({ _id: g._id }, { $inc: { 'stats.unitsDigital': i.qty, 'stats.keysSold': i.qty, 'stats.keysAvailable': -keyIds.length } });
      } else {
        await Game.updateOne({ _id: g._id }, { $inc: { 'stats.unitsDigital': i.qty } });
      }
      const gross = +(i.unitPrice * i.qty).toFixed(2);
      await Game.updateOne({ _id: g._id }, { $inc: { 'stats.revenueGross': gross } });
      orderItems.push({ kind: 'game', game: g._id, title: g.title, edition: i.edition, unitPrice: i.unitPrice, qty: i.qty, weightLb: i.weightLb || 0, keyIds });
      devPayouts.push({ developer: g.developer, game: g._id, gross, cut: +(gross * DEV_CUT).toFixed(2) });
      await User.updateOne({ _id: g.developer }, { $inc: { 'devProfile.balanceOwed': +(gross * DEV_CUT).toFixed(2) } });
    }
  } catch (e) {
    if (claimedKeyIds.length) await GameKey.updateMany({ _id: { $in: claimedKeyIds } }, { $set: { status: 'available', order: null, user: null, soldAt: null } });
    for (const r of decPhys) await Game.updateOne({ _id: r.gameId }, { $inc: { 'physical.stock': r.qty, 'stats.unitsPhysical': -r.qty } });
    for (const r of decToys) await Toy.updateOne({ _id: r.toyId }, { $inc: { stock: r.qty, 'stats.unitsSold': -r.qty } });
    return res.status(400).json({ error: e.message });
  }
  const tracking = hasPhysical ? 'PV-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100) : undefined;
  const order = await Order.create({
    user: req.session.user._id, items: orderItems, subtotal, discountTotal: 0, tax, shippingTotal: shipCost, grandTotal,
    payment: { method: 'card', last4: String(cardLast4).slice(-4) },
    shipment: hasPhysical ? { tracking, method, cost: shipCost, address: { fullName, street, city, region, postal, country, phone }, status: 'packing' } : undefined,
    devPayouts,
  });
  const user = await User.findById(req.session.user._id);
  for (const oi of orderItems) {
    if (oi.kind === 'toy') {
      const has = (user.toyLibrary || []).some((e) => String(e.toy) === String(oi.toy));
      if (has) user.toyLibrary.find((e) => String(e.toy) === String(oi.toy)).qty += oi.qty;
      else user.toyLibrary.push({ toy: oi.toy, qty: oi.qty });
    } else if (!user.ownsGame(oi.game)) user.library.push({ game: oi.game, edition: oi.edition });
  }
  user.purchaseHistory.push(order._id);
  if (hasPhysical) {
    const exists = user.addresses.some((a) => a.street === street && a.postal === postal);
    if (exists === false) user.addresses.push({ label: 'Checkout', fullName, street, city, region, postal, country, phone });
  }
  await user.save();
  if (claimedKeyIds.length) await GameKey.updateMany({ _id: { $in: claimedKeyIds } }, { $set: { order: order._id } });
  req.session.cart = [];
  res.json({ ok: true, orderId: order._id });
});

function withPlainKeys(order) {
  const plainById = {};
  (order.items || []).forEach((it) => (it.keyIds || []).forEach((k) => {
    try { plainById[String(k._id)] = decryptKey(k.codeEnc); } catch { plainById[String(k._id)] = '(undecryptable)'; }
  }));
  return plainById;
}

router.get('/orders', needLogin, async (req, res) => {
  const orders = await Order.find({ user: req.session.user._id }).sort({ createdAt: -1 }).lean();
  res.json({ orders });
});

router.get('/orders/:id', needLogin, async (req, res) => {
  const order = await Order.findById(req.params.id).populate('items.game').populate('items.toy').populate('items.keyIds').lean();
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (String(order.user) !== String(req.session.user._id) && req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  res.json({ order, plainById: withPlainKeys(order) });
});

router.post('/orders/:id/advance', needLogin, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || !order.shipment) return res.status(400).json({ error: 'No shipment' });
  const flow = ['packing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered'];
  const idx = flow.indexOf(order.shipment.status);
  if (idx < flow.length - 1) {
    order.shipment.status = flow[idx + 1];
    if (order.shipment.status === 'shipped') { order.shipment.shippedAt = new Date(); order.status = 'shipped'; }
    if (order.shipment.status === 'delivered') { order.shipment.deliveredAt = new Date(); order.status = 'delivered'; }
    await order.save();
  }
  res.json({ ok: true, status: order.shipment.status });
});

// ---------- library ----------
router.get('/library', needLogin, async (req, res) => {
  const user = await User.findById(req.session.user._id).populate('library.game').populate('wishlist').populate('toyLibrary.toy').populate('toyWishlist').lean();
  const GameKeyM = require('../models/GameKey');
  const keys = await GameKeyM.find({ user: req.session.user._id, status: 'sold' }).populate('game', 'title slug').lean();
  const plainById = {};
  keys.forEach((k) => { try { plainById[String(k._id)] = decryptKey(k.codeEnc); } catch {} });
  const keysByGame = {};
  keys.forEach((k) => {
    const gid = String(k.game?._id || k.game);
    (keysByGame[gid] = keysByGame[gid] || []).push(k);
  });
  res.json({ user, keysByGame, plainById });
});

router.post('/library/play/:gameId', needLogin, async (req, res) => {
  const user = await User.findById(req.session.user._id);
  const entry = user.library.find((e) => String(e.game) === String(req.params.gameId));
  if (!entry) return res.status(404).json({ error: 'Not in library' });
  entry.playMinutes += 30;
  entry.lastPlayedAt = new Date();
  user.playHistory.push({ game: entry.game, minutes: 30 });
  if (entry.playMinutes >= 60 && !entry.achievements.some((a) => a.key === 'first-hour')) entry.achievements.push({ key: 'first-hour', unlockedAt: new Date() });
  if (entry.playMinutes >= 600 && !entry.achievements.some((a) => a.key === 'marathon')) entry.achievements.push({ key: 'marathon', unlockedAt: new Date() });
  await user.save();
  res.json({ ok: true, playMinutes: entry.playMinutes });
});

router.get('/recommendations', needLogin, async (req, res) => {
  const user = await User.findById(req.session.user._id).populate('library.game').lean();
  const genreCount = {};
  (user.library || []).forEach((e) => (e.game?.genres || []).forEach((g) => { genreCount[g] = (genreCount[g] || 0) + 1; }));
  const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
  const ownedIds = (user.library || []).map((e) => String(e.game?._id || e.game));
  let recs = await Game.find({ status: 'published', productType: { $ne: 'toy' }, genres: { $in: topGenres.length ? topGenres : ['Action'] } }).lean();
  recs = recs.filter((g) => !ownedIds.includes(String(g._id))).slice(0, 8);
  res.json({ topGenres, recs });
});

// ---------- reviews ----------
router.post('/reviews/:gameId', needLogin, async (req, res) => {
  const user = await User.findById(req.session.user._id);
  if (!user.ownsGame(req.params.gameId)) return res.status(403).json({ error: 'You must own the game to review.' });
  const entry = user.library.find((e) => String(e.game) === String(req.params.gameId));
  try {
    await Review.create({ game: req.params.gameId, user: user._id, stars: Number(req.body.stars), title: req.body.title, body: req.body.body, playMinutesAtReview: entry?.playMinutes || 0 });
    const agg = await Review.aggregate([{ $match: { game: new (require('mongoose').Types.ObjectId)(req.params.gameId) } }, { $group: { _id: null, sum: { $sum: '$stars' }, n: { $sum: 1 } } }]);
    if (agg[0]) await Game.updateOne({ _id: req.params.gameId }, { $set: { 'stats.reviewSum': agg[0].sum, 'stats.reviewCount': agg[0].n } });
  } catch (e) { return res.status(400).json({ error: 'Already reviewed or invalid.' }); }
  res.json({ ok: true });
});

router.post('/reviews/:id/helpful', needLogin, async (req, res) => {
  const r = await Review.findById(req.params.id);
  const uid = req.session.user._id;
  if (r.helpful.map(String).includes(String(uid))) r.helpful.pull(uid); else r.helpful.push(uid);
  await r.save();
  res.json({ ok: true, helpful: r.helpful.length });
});

router.post('/reviews/:id/respond', needLogin, async (req, res) => {
  const r = await Review.findById(req.params.id).populate('game');
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (String(r.game.developer) !== String(req.session.user._id) && req.session.user.role !== 'admin') return res.status(403).json({ error: 'Only the developer can respond.' });
  r.devResponse = { text: req.body.text, respondedAt: new Date() };
  await r.save();
  res.json({ ok: true });
});

// ---------- users ----------
router.get('/users/:username', async (req, res) => {
  const user = await User.findOne({ username: req.params.username }).populate('library.game', 'title coverImage slug genres').populate('wishlist', 'title coverImage slug price discountPct').lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  const orders = await Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(10).lean();
  const isSelf = req.session.user && String(req.session.user._id) === String(user._id);
  if (!isSelf) { delete user.phone; delete user.purchaseHistory; }
  res.json({ user, orders: isSelf ? orders : [], isSelf });
});

router.post('/users/me', needLogin, async (req, res) => {
  const patch = {};
  if (req.body.bio !== undefined) patch.bio = String(req.body.bio).slice(0, 500);
  if (req.body.avatar !== undefined) patch.avatar = String(req.body.avatar).slice(0, 500);
  if (req.body.displayName !== undefined) patch.displayName = String(req.body.displayName).slice(0, 40);
  if (req.body.phone !== undefined) patch.phone = String(req.body.phone).slice(0, 20);
  if (req.body.favoriteGenres !== undefined) patch['preferences.favoriteGenres'] = (Array.isArray(req.body.favoriteGenres) ? req.body.favoriteGenres : String(req.body.favoriteGenres).split(',')).map((s) => String(s).trim()).filter(Boolean).slice(0, 10);
  if (req.body.matureFilter !== undefined) patch['preferences.matureFilter'] = !!req.body.matureFilter;
  await User.updateOne({ _id: req.session.user._id }, patch);
  res.json({ ok: true });
});

router.post('/users/me/addresses', needLogin, async (req, res) => {
  const { label, fullName, street, city, region, postal, country, phone } = req.body;
  if (!fullName || !street || !city || !postal) return res.status(400).json({ error: 'Name, street, city and ZIP are required.' });
  const user = await User.findById(req.session.user._id);
  user.addresses.push({ label: label || 'Home', fullName, street, city, region, postal, country: country || 'US', phone });
  await user.save();
  res.json({ ok: true, addresses: user.addresses });
});

router.delete('/users/me/addresses/:id', needLogin, async (req, res) => {
  const user = await User.findById(req.session.user._id);
  user.addresses.pull(req.params.id);
  await user.save();
  res.json({ ok: true, addresses: user.addresses });
});

// ---------- dev ----------
router.post('/dev/apply', needLogin, async (req, res) => {
  const { studioName, website, payoutEmail } = req.body;
  if (!studioName || !payoutEmail) return res.status(400).json({ error: 'Studio + payout email required.' });
  await User.updateOne({ _id: req.session.user._id }, { role: 'developer', devProfile: { studioName, website, payoutEmail, verified: false, balanceOwed: 0 } });
  req.session.user.role = 'developer';
  res.json({ ok: true });
});

router.get('/dev', needDev, async (req, res) => {
  const games = await Game.find({ developer: req.session.user._id }).lean();
  const gameIds = games.map((g) => g._id);
  const orders = await Order.find({ 'devPayouts.game': { $in: gameIds } }).lean();
  let gross = 0, devCut = 0, unitsD = 0, unitsP = 0;
  const monthly = {}; const byGame = {}; const byCountry = {};
  for (const o of orders) {
    const m = new Date(o.createdAt).toISOString().slice(0, 7);
    for (const p of o.devPayouts) {
      if (!gameIds.map(String).includes(String(p.game))) continue;
      gross += p.gross; devCut += p.cut;
      monthly[m] = (monthly[m] || 0) + p.gross;
      byGame[String(p.game)] = (byGame[String(p.game)] || 0) + p.gross;
    }
    for (const it of o.items) {
      if (!gameIds.map(String).includes(String(it.game))) continue;
      if (it.edition === 'physical') unitsP += it.qty; else unitsD += it.qty;
    }
    const c = o.shipment?.address?.country || 'DIGITAL';
    byCountry[c] = (byCountry[c] || 0) + 1;
  }
  const meU = await User.findById(req.session.user._id).lean();
  res.json({ games, gross, devCut, unitsD, unitsP, monthly: Object.entries(monthly).sort(), byGame, byCountry, balance: meU.devProfile?.balanceOwed || 0 });
});

router.post('/dev/new', needDev, async (req, res) => {
  try {
    const b = req.body;
    const game = await Game.create({
      title: b.title, tagline: b.tagline, description: b.description, developer: req.session.user._id,
      studioName: b.studioName || req.session.user.username,
      genres: Array.isArray(b.genres) ? b.genres : String(b.genres || 'Indie').split(',').map((s) => s.trim()).filter(Boolean),
      tags: Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',').map((s) => s.trim()).filter(Boolean),
      platforms: b.platforms?.length ? b.platforms : ['Windows'],
      features: Array.isArray(b.features) ? b.features : String(b.features || '').split(',').map((s) => s.trim()).filter(Boolean),
      coverImage: b.coverImage, screenshots: b.screenshots || [],
      price: Number(b.price), discountPct: Number(b.discountPct || 0),
      fileSizeGB: Number(b.fileSizeGB || 5), version: b.version || '1.0.0',
      physical: { enabled: !!b.physicalEnabled, price: Number(b.physicalPrice || 0), stock: Number(b.physicalStock || 0), weightLb: Number(b.weightLb || 0.5), warehouse: b.warehouse || 'US-EAST', includes: b.physicalIncludes || [] },
      rating: b.rating || 'E', status: 'published', releaseDate: b.releaseDate ? new Date(b.releaseDate) : new Date(),
    });
    res.json({ ok: true, slug: game.slug });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/dev/payout', needDev, async (req, res) => {
  const meU = await User.findById(req.session.user._id);
  if ((meU.devProfile?.balanceOwed || 0) < 10) return res.status(400).json({ error: 'Minimum $10 payout.' });
  meU.devProfile.balanceOwed = 0;
  await meU.save();
  res.json({ ok: true });
});

router.get('/dev/:id/keys', needDev, async (req, res) => {
  const game = await Game.findOne({ _id: req.params.id, developer: req.session.user._id }).lean();
  if (!game) return res.status(404).json({ error: 'Not found' });
  const [available, sold, revoked] = await Promise.all([
    GameKey.countDocuments({ game: game._id, status: 'available' }),
    GameKey.countDocuments({ game: game._id, status: 'sold' }),
    GameKey.countDocuments({ game: game._id, status: 'revoked' }),
  ]);
  res.json({ game, available, sold, revoked });
});

router.post('/dev/:id/keys/import', needDev, async (req, res) => {
  const { encryptKey, hashKey } = require('../lib/keyCrypto');
  const game = await Game.findOne({ _id: req.params.id, developer: req.session.user._id });
  if (!game) return res.status(404).json({ error: 'Not found' });
  const parts = String(req.body.keys || '').split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 2000);
  if (!parts.length) return res.status(400).json({ error: 'No keys found in input.' });
  const batchId = String(req.body.batchId || `manual-${Date.now().toString(36)}`).slice(0, 40);
  const platform = ['Steam', 'Epic', 'GOG', 'PixelVault'].includes(req.body.platform) ? req.body.platform : 'Steam';
  let added = 0;
  for (const plain of parts) {
    try {
      await GameKey.create({ game: game._id, batchId, platform, codeEnc: encryptKey(plain), codeHash: hashKey(`${game._id}:${plain}`), status: 'available' });
      added++;
    } catch {}
  }
  await Game.updateOne({ _id: game._id }, { $inc: { 'stats.keysAvailable': added } });
  res.json({ ok: true, added });
});

router.post('/dev/:id/keys/generate', needDev, async (req, res) => {
  const { encryptKey, hashKey, makeDemoKey } = require('../lib/keyCrypto');
  const game = await Game.findOne({ _id: req.params.id, developer: req.session.user._id });
  if (!game) return res.status(404).json({ error: 'Not found' });
  const n = Math.min(500, Math.max(1, Number(req.body.count || 20)));
  const batchId = `demo-${Date.now().toString(36)}`;
  let added = 0;
  for (let i = 0; i < n; i++) {
    const plain = makeDemoKey('DEMO');
    try {
      await GameKey.create({ game: game._id, batchId, platform: 'Steam', codeEnc: encryptKey(plain), codeHash: hashKey(`${game._id}:${plain}`), status: 'available' });
      added++;
    } catch {}
  }
  await Game.updateOne({ _id: game._id }, { $inc: { 'stats.keysAvailable': added } });
  res.json({ ok: true, added });
});

router.get('/dev/toys', needDev, async (req, res) => {
  const toys = await Toy.find({}).sort({ title: 1 }).lean();
  res.json({ toys });
});

router.post('/dev/toys/:id/restock', needDev, async (req, res) => {
  const qty = Math.max(0, Math.min(999, Number(req.body.stock ?? 0)));
  await Toy.updateOne({ _id: req.params.id }, { $set: { stock: qty } });
  res.json({ ok: true });
});

// ---------- community & mods (read + post) ----------
router.get('/community', async (req, res) => {
  const { board, game } = req.query;
  const filter = {};
  if (board) filter.board = board;
  if (game) filter.game = game;
  const posts = await Post.find(filter).populate('author', 'username').sort({ pinned: -1, createdAt: -1 }).limit(30).lean();
  res.json({ posts });
});

router.get('/community/p/:id', async (req, res) => {
  const post = await Post.findById(req.params.id).populate('author', 'username').populate('replies.user', 'username').lean();
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.json({ post });
});

router.post('/community/new', needLogin, async (req, res) => {
  const p = await Post.create({ board: req.body.board || 'general', game: req.body.game || null, title: req.body.title, body: req.body.body, author: req.session.user._id, tags: req.body.tags || [] });
  res.json({ ok: true, id: p._id });
});

router.post('/community/p/:id/reply', needLogin, async (req, res) => {
  const p = await Post.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  p.replies.push({ user: req.session.user._id, text: req.body.text });
  await p.save();
  res.json({ ok: true });
});

router.get('/mods', async (req, res) => {
  const mods = await Mod.find({ status: 'published', ...(req.query.game ? { game: req.query.game } : {}) }).populate('author', 'username').sort({ 'stats.downloads': -1 }).limit(30).lean();
  res.json({ mods });
});

router.get('/mods/:id', async (req, res) => {
  const mod = await Mod.findById(req.params.id).populate('author', 'username').populate('game', 'title slug').lean();
  if (!mod) return res.status(404).json({ error: 'Not found' });
  res.json({ mod });
});

router.get('/stats', async (req, res) => {
  const [games, orders, toys] = await Promise.all([Game.countDocuments({ status: 'published' }), Order.countDocuments(), Toy.countDocuments({ status: 'published' })]);
  res.json({ games, orders, toys, ok: true });
});

// Live external Steam data: current players + community review verdict.
router.get('/live/:appid', async (req, res) => {
  try {
    const { liveFor } = require('../lib/steamLive');
    const data = await liveFor(Number(req.params.appid));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
