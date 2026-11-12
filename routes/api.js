// JSON API for the React SPA. Mirrors the EJS routes' logic, session-authenticated.
const express = require('express');
const Game = require('../models/Game');
const GameKey = require('../models/GameKey');
const Order = require('../models/Order');
const User = require('../models/User');
const Toy = require('../models/Toy');
const Review = require('../models/Review');
const Post = require('../models/Post');
const Payment = require('../models/Payment');
const QrLogin = require('../models/QrLogin');
const Payout = require('../models/Payout');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { decryptKey } = require('../lib/keyCrypto');
const { issueKeys, supplierConfigured } = require('../lib/keyProvider');
const gateway = require('../lib/paymentGateway');
const loginLimiter = require('../lib/loginLimiter');
const cache = require('../lib/cache');
const { getBucket } = require('../lib/gridfs');

const router = express.Router();

// Mongoose ids are 24-char hex. Anything else in an :id route is a bad
// request, not a server fault — checked before it reaches a query.
const isObjectId = (v) => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);

const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/* Content-Type is client-supplied, so check the signature as well. */
function looksLikeImage(buf, mime) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
  if (mime === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/gif') return buf.toString('ascii', 0, 4) === 'GIF8';
  if (mime === 'image/webp') return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

// ---------- deployed build stamp ----------
// The SPA polls this. If the bundle on disk is newer than what the tab is
// running, the client reloads itself — no more staring at a stale build.
const fs = require('fs');
const path = require('path');
const DIST = path.join(__dirname, '..', 'client', 'dist', 'assets');
let stampCache = { at: 0, value: null };
function deployedBuild() {
  if (Date.now() - stampCache.at < 30000) return stampCache.value;
  let v = null;
  try {
    const js = fs.readdirSync(DIST).find((f) => /^index-.*\.js$/.test(f));
    if (js) v = (fs.readFileSync(path.join(DIST, js), 'utf8').match(/20\d{6}-\d{2}/) || [])[0] || null;
  } catch {}
  stampCache = { at: Date.now(), value: v };
  return v;
}
router.get('/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ build: deployedBuild() });
});

/* Liveness probe, pointed at by the platform's health check.
 *
 * It answers 200 whenever the process is up, even with no database yet. MongoDB
 * often takes longer than the app to come online, and a probe that turned
 * non-2xx while the connection was still opening would get a perfectly good
 * deployment marked as failed. Callers that need the database ask for real
 * endpoints — those answer 503 through the gate below until it is live. */
router.get('/health', (req, res) => {
  const state = mongoose.connection.readyState;
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    db: state === 1 ? 'connected' : state === 2 ? 'connecting' : 'disconnected',
    build: deployedBuild(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// ---------- database gate ----------
// Mongoose buffers queries issued before the connection is live, then throws
// "buffering timed out" as an unhandled rejection which kills the whole
// process. Refusing early with 503 keeps the server up and lets the client's
// retry logic do its job while MongoDB is still coming up.
const DB_FREE_ENDPOINTS = new Set(['/version', '/health']);
router.use((req, res, next) => {
  if (DB_FREE_ENDPOINTS.has(req.path)) return next();
  const state = mongoose.connection.readyState; // 1 === connected
  if (state === 1) return next();
  return res.status(503).json({
    error: state === 2 ? 'Database is connecting — retry shortly.' : 'Database is not available yet.',
    readyState: state,
    hint: 'MongoDB is still starting. start-website.bat waits for it automatically.',
  });
});

// Public, session-independent GETs get a short TTL cache. Anything that reads
// the signed-in user (library, cart, orders, recommendations, games-with-
// mature-filter) is deliberately excluded.
const CACHEABLE = new Set(['/home', '/stats', '/toys', '/community', '/deals']);
router.use((req, res, next) => {
  if (req.method === 'GET' && CACHEABLE.has(req.path)) return cache(30)(req, res, next);
  next();
});

const needLogin = async (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });
  try {
    /* A cookie session outlives the database row it names: the admin can delete
       an account while that browser still holds a valid cookie. Refresh the
       user from MongoDB on every protected request and clear the cookie when
       the account no longer exists. */
    const u = await User.findById(req.session.user._id).select('username role email avatar isBanned').lean();
    if (!u || u.isBanned) { req.session = null; return res.status(403).json({ error: u?.isBanned ? 'Account suspended.' : 'Login required' }); }
    req.session.user = { _id: u._id, username: u.username, role: u.role, email: u.email, avatar: u.avatar || '' };
    next();
  } catch (e) { res.status(500).json({ error: 'Login check failed.' }); }
};
const needDev = async (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });
  try {
    const u = await User.findById(req.session.user._id).select('role isBanned').lean();
    if (!u || u.isBanned || !['developer', 'admin'].includes(u.role)) return res.status(403).json({ error: u?.isBanned ? 'Account suspended.' : 'Developer required' });
    req.session.user.role = u.role;
    next();
  } catch (e) { res.status(500).json({ error: 'Authorization check failed.' }); }
};
const needAdmin = async (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Login required' });
  try {
    const u = await User.findById(req.session.user._id).select('role isBanned').lean();
    if (!u || u.isBanned || u.role !== 'admin') return res.status(403).json({ error: u?.isBanned ? 'Account suspended.' : 'Admin required' });
    req.session.user.role = u.role;
    next();
  } catch (e) { res.status(500).json({ error: 'Authorization check failed.' }); }
};
const me = (req) => (req.session.user ? { _id: req.session.user._id, username: req.session.user.username, role: req.session.user.role, email: req.session.user.email, avatar: req.session.user.avatar || '' } : null);

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
    req.session.user = { _id: user._id, username: user.username, role: user.role, email: user.email, avatar: user.avatar || '' };
    res.json({ user: me(req) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/auth/login', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { email, password } = req.body;
    const gate = loginLimiter.check(req, email);
    if (gate.blocked) {
      res.set('Retry-After', String(gate.retryAfterSec));
      return res.status(429).json({
        error: `Too many login attempts. Try again in ${Math.max(1, Math.ceil(gate.retryAfterSec / 60))} minute(s).`,
      });
    }
    const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');
    if (!user) {
      loginLimiter.recordFailure(req, email);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      loginLimiter.recordFailure(req, email);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    if (user.isBanned) return res.status(403).json({ error: 'Account suspended. Contact support.' });
    loginLimiter.clear(req, email);
    req.session.user = { _id: user._id, username: user.username, role: user.role, email: user.email, avatar: user.avatar || '' };
    res.json({ user: me(req) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/auth/logout', (req, res) => { req.session = null; res.json({ ok: true }); });
router.get('/auth/me', async (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  const u = await User.findById(req.session.user._id).select('username role email avatar isBanned').lean().catch(() => null);
  if (!u || u.isBanned) { req.session = null; return res.json({ user: null, banned: !!u?.isBanned }); }
  req.session.user = { _id: u._id, username: u.username, role: u.role, email: u.email, avatar: u.avatar || '' };
  res.json({ user: me(req) });
});

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
    const { q, genre, tag, platform, feature, sort = 'popular', maxPrice, onSale, page = '1', limit = '24' } = req.query;
    const filter = { status: 'published', productType: { $ne: 'toy' } };
    if (genre) filter.genres = genre;
    if (tag) filter.tags = tag;
    if (platform) filter.platforms = platform;
    if (feature) filter.features = feature;
    if (onSale === '1') filter.discountPct = { $gt: 0 };
    // Honor the viewer's "hide mature titles" setting.
    try {
      const viewer = req.session.user ? await User.findById(req.session.user._id).lean() : null;
      if (viewer?.preferences?.matureFilter) filter.rating = { $nin: ['M', 'AO'] };
    } catch {}
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { description: rx }, { tagline: rx }];
    }
    const effectivePrice = { $multiply: ['$price', { $subtract: [1, { $divide: [{ $ifNull: ['$discountPct', 0] }, 100] }] }] };
    if (maxPrice !== undefined && maxPrice !== '') {
      const mp = Number(maxPrice);
      if (!Number.isNaN(mp)) filter.$expr = { $lte: [effectivePrice, mp] };
    }
    const lim = Math.min(60, Math.max(1, parseInt(limit, 10) || 24));
    const total = await Game.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / lim));
    const pg = Math.min(Math.max(1, parseInt(page, 10) || 1), totalPages);
    const skip = (pg - 1) * lim;
    const sortSpec = {
      popular: { _popular: -1, _id: 1 },
      newest: { releaseDate: -1, _id: -1 },
      priceAsc: { _effectivePrice: 1, _id: 1 },
      priceDesc: { _effectivePrice: -1, _id: -1 },
      rating: { _rating: -1, 'stats.reviewCount': -1, _id: 1 },
    }[sort] || { _popular: -1, _id: 1 };
    /* Sort and paginate in MongoDB. The previous version loaded the whole
       catalogue, filtered and sorted it in Node, then sliced out one page —
       fine at 74 rows, O(catalogue) at any real size. */
    const pageIds = await Game.aggregate([
      { $match: filter },
      { $addFields: {
        _effectivePrice: effectivePrice,
        _popular: { $add: [{ $ifNull: ['$stats.views', 0] }, { $multiply: [{ $ifNull: ['$stats.unitsDigital', 0] }, 10] }] },
        _rating: { $cond: [{ $gt: [{ $ifNull: ['$stats.reviewCount', 0] }, 0] }, { $divide: [{ $ifNull: ['$stats.reviewSum', 0] }, '$stats.reviewCount'] }, 0] },
      } },
      { $sort: sortSpec },
      { $skip: skip },
      { $limit: lim },
      { $project: { _id: 1 } },
    ]);
    const ids = pageIds.map((r) => r._id);
    const docs = ids.length ? await Game.find({ _id: { $in: ids } }).populate('developer', 'username').lean() : [];
    const byId = new Map(docs.map((g) => [String(g._id), g]));
    const items = ids.map((id) => byId.get(String(id))).filter(Boolean);
    const scope = { status: 'published', productType: { $ne: 'toy' } };
    const [genres, tags, categories, platforms] = await Promise.all([
      Game.distinct('genres', scope),
      // Most-used tags first, so the store's tag browser shows the popular
      // ones instead of an alphabetical wall of every tag in the catalogue.
      Game.aggregate([
        { $match: scope },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', n: { $sum: 1 } } },
        { $sort: { n: -1, _id: 1 } },
        { $limit: 30 },
      ]).then((rows) => rows.map((r) => r._id)),
      Game.distinct('categories', scope),
      Game.distinct('platforms', scope),
    ]);
    res.json({ games: items, total, totalPages, page: pg, limit: lim, genres, tags, categories, platforms });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/games/:slug', async (req, res) => {
  try {
    const game = await Game.findOne({ slug: req.params.slug }).populate('developer', 'username').lean();
    if (!game) return res.status(404).json({ error: 'Game not found' });
    await Game.updateOne({ _id: game._id }, { $inc: { 'stats.views': 1 } });
    const reviews = await Review.find({ game: game._id }).populate('user', 'username').sort({ createdAt: -1 }).limit(20).lean();
    // Flag which reviews the signed-in user already found helpful, so the
    // button can render in its "voted" state without a second request.
    const meId = req.session.user && String(req.session.user._id);
    if (meId) for (const r of reviews) r.helpful = (r.helpful || []).map(String);
    const threads = await Post.find({ game: game._id }).sort({ createdAt: -1 }).limit(5).populate('author', 'username').lean();
    /* Nothing to count: a digital key is obtained when the order is fulfilled,
       so a listing is buyable whenever it has a price. `buyable` replaces the
       old keysAvailable counter, which could only ever be a made-up number. */
    const buyable = game.price > 0;
    res.json({ game, reviews, threads, buyable, supplier: supplierConfigured(), me: meId || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/games/:id/wishlist', needLogin, async (req, res) => {
  const user = await User.findById(req.session.user._id);
  const gid = req.params.id;
  const list = Array.isArray(user.wishlist) ? user.wishlist : [];
  const has = list.map(String).includes(String(gid));
  user.wishlist = has ? list.filter((x) => String(x) !== String(gid)) : [...list, gid];
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
  const list = Array.isArray(user.toyWishlist) ? user.toyWishlist : [];
  const has = list.map(String).includes(String(tid));
  user.toyWishlist = has ? list.filter((x) => String(x) !== String(tid)) : [...list, tid];
  await user.save();
  res.json({ wishlisted: !has });
});

// ---------- home ----------
router.get('/home', async (req, res) => {
  try {
    const published = { status: 'published', productType: { $ne: 'toy' } };
    const catNames = ['Action', 'RPG', 'Strategy', 'Indie', 'Adventure', 'Simulation', 'Horror', 'Free to Play'];
    const [featured, deals, fresh, threads, toys, catRows, titles, toyCount, dealsAgg, keysIssued, orderAgg] = await Promise.all([
      Game.find({ ...published, featured: true }).limit(5).lean(),
      Game.find({ ...published, discountPct: { $gt: 0 } }).sort({ discountPct: -1 }).limit(8).lean(),
      Game.find(published).sort({ releaseDate: -1 }).limit(8).lean(),
      Post.find().sort({ createdAt: -1 }).limit(5).populate('author', 'username').lean(),
      Toy.find({ status: 'published' }).limit(4).lean(),
      Game.aggregate([
        { $match: { ...published, genres: { $in: catNames } } },
        { $unwind: '$genres' },
        { $match: { genres: { $in: catNames } } },
        { $sort: { 'stats.views': -1 } },
        { $group: { _id: '$genres', img: { $first: '$coverImage' }, slug: { $first: '$slug' } } },
      ]),
      // Ledger figures — all counted from the database, never invented.
      Game.countDocuments(published),
      Toy.countDocuments({ status: 'published' }),
      Game.countDocuments({ ...published, discountPct: { $gt: 0 } }),
      GameKey.countDocuments({ status: 'sold' }),
      Order.countDocuments({ status: { $ne: 'cancelled' } }),
    ]);
    const byGenre = new Map(catRows.map((r) => [r._id, r]));
    const catTiles = catNames.map((name) => byGenre.get(name)).filter(Boolean).map((r) => ({ name: r._id, img: r.img, slug: r.slug }));
    const ledger = { titles, toys: toyCount, onSale: dealsAgg, keysIssued, orders: orderAgg };
    res.json({ featured, deals, fresh, threads, toys, catTiles, ledger });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- deals ----------
/* Small, cacheable payload for the sidebar deal list. */
router.get('/deals', async (req, res) => {
  try {
    const limit = Math.min(6, Math.max(1, parseInt(req.query.limit, 10) || 3));
    const deals = await Game.find({ status: 'published', productType: { $ne: 'toy' }, discountPct: { $gt: 0 } })
      .sort({ discountPct: -1 })
      .limit(limit)
      .select('title slug coverImage price discountPct')
      .lean();
    res.json({ deals });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- cart ----------
const getCart = (req) => { if (!req.session.cart) req.session.cart = []; return req.session.cart; };

router.get('/cart', async (req, res) => {
  await consumeCartClear(req);
  const items = getCart(req);
  const dead = [];
  for (const i of items) {
    if ((i.kind || 'game') === 'toy') {
      const t = await Toy.findById(i.toyId).lean();
      if (t) {
        i.title = t.title; i.slug = t.slug; i.coverImage = t.coverImage;
        i.unitPrice = t.price; i.weightLb = t.weightLb || 1.0; i.stock = t.stock;
      } else dead.push(i.key);
    } else {
      const g = await Game.findById(i.gameId).lean();
      if (g) {
        i.title = g.title; i.slug = g.slug; i.coverImage = g.coverImage;
        i.unitPrice = i.edition === 'physical' ? g.physical.price || g.price + 15 : +(g.price * (1 - g.discountPct / 100)).toFixed(2);
        i.weightLb = i.edition === 'physical' ? g.physical.weightLb || 0.5 : 0;
        /* A digital key is obtained from the supplier when the order is
           fulfilled, so it has no stock. Reporting physical.stock here showed
           "0 in stock" for every downloadable game. */
        if (i.edition === 'physical') i.stock = g.physical.stock;
        else delete i.stock;
      } else dead.push(i.key);
    }
  }
  // drop entries whose product vanished from the catalog
  for (const k of dead) req.session.cart = req.session.cart.filter((x) => x.key !== k);
  const live = getCart(req);
  res.json({ items: live, subtotal: +live.reduce((s, i) => s + (Number(i.unitPrice) || 0) * i.qty, 0).toFixed(2) });
});

router.post('/cart/add', async (req, res) => {
  await consumeCartClear(req);
  const { gameId, toyId, edition = 'digital', qty = 1 } = req.body;
  const items = getCart(req);
  const qtyWanted = Math.trunc(Number(qty));
  if (!Number.isFinite(qtyWanted) || qtyWanted < 1) {
    return res.status(400).json({ error: 'Quantity must be at least 1.' });
  }
  if (toyId) {
    const t = await Toy.findById(toyId);
    if (!t || t.status !== 'published') return res.status(404).json({ error: 'Collectible not found' });
    const key = `toy:${toyId}`;
    const found = items.find((i) => i.key === key);
    if (!found && items.length >= 20) return res.status(400).json({ error: 'Cart is full (20 items). Checkout or remove an item.' });
    const nextQty = (found ? found.qty : 0) + qtyWanted;
    if (nextQty > 9) return res.status(400).json({ error: 'At most 9 units of one item.' });
    if (nextQty > (t.stock || 0)) return res.status(400).json({ error: `Only ${t.stock} left in stock.` });
    if (found) found.qty = nextQty;
    else items.push({ key, kind: 'toy', toyId: String(t._id), title: t.title, coverImage: t.coverImage, edition: 'physical', qty: qtyWanted, unitPrice: t.price, weightLb: t.weightLb || 1.0 });
    return res.json({ ok: true, items });
  }
  const g = await Game.findById(gameId);
  if (!g) return res.status(404).json({ error: 'Game not found' });
  const key = `game:${gameId}:${edition}`;
  const found = items.find((i) => i.key === key);
  if (!found && items.length >= 20) return res.status(400).json({ error: 'Cart is full (20 items). Checkout or remove an item.' });
  const nextQty = (found ? found.qty : 0) + qtyWanted;
  if (nextQty > 9) return res.status(400).json({ error: 'At most 9 units of one item.' });
  if (edition === 'physical' && (!g.physical.enabled || g.physical.stock < nextQty)) {
    return res.status(400).json({ error: 'Physical edition out of stock.' });
  }
  // A digital key is fetched from the supplier when the order is fulfilled, so
  // there is no stock to check here. Only the price decides whether it is a
  // keyed product at all.
  const unitPrice = edition === 'physical' ? g.physical.price || g.price + 15 : +(g.price * (1 - g.discountPct / 100)).toFixed(2);
  if (found) found.qty = nextQty;
  else items.push({ key, kind: 'game', gameId: String(g._id), title: g.title, coverImage: g.coverImage, edition, qty: qtyWanted, unitPrice, weightLb: edition === 'physical' ? g.physical.weightLb || 0.5 : 0 });
  res.json({ ok: true, items });
});

router.post('/cart/remove', (req, res) => {
  req.session.cart = getCart(req).filter((i) => i.key !== req.body.key);
  res.json({ ok: true, items: req.session.cart });
});

router.post('/cart/qty', async (req, res) => {
  const items = getCart(req);
  const item = items.find((i) => i.key === req.body.key);
  if (!item) return res.status(404).json({ error: 'Item is not in the cart.' });
  const qty = Math.trunc(Number(req.body.qty));
  if (!Number.isFinite(qty) || qty < 1 || qty > 9) {
    return res.status(400).json({ error: 'Quantity must be between 1 and 9.' });
  }
  /* Check the shelf at the moment the number changes, not only when the order
     is placed. Letting the cart reach 9 while 3 are left means the shopper
     only learns at the gateway, after choosing a payment method. */
  if ((item.kind || 'game') === 'toy') {
    const t = await Toy.findById(item.toyId).select('stock').lean();
    if (!t) return res.status(404).json({ error: 'Collectible not found.' });
    if (qty > (t.stock || 0)) return res.status(400).json({ error: `Only ${t.stock} left in stock.` });
  } else if (item.edition === 'physical') {
    const g = await Game.findById(item.gameId).select('physical.stock').lean();
    if (!g) return res.status(404).json({ error: 'Game not found.' });
    if (qty > (g.physical?.stock || 0)) return res.status(400).json({ error: `Only ${g.physical?.stock || 0} left in stock.` });
  }
  item.qty = qty;
  res.json({ ok: true, items });
});

// ---------- checkout & orders ----------
const TAX_RATE = Number(process.env.TAX_RATE || 0.08);
const VND_PER_USD = Number(process.env.VND_PER_USD || 25000);
const DEV_CUT = Number(process.env.DEV_REVENUE_CUT || 0.7);
/* Shipping rates are demo pricing, not a real carrier tariff. They are read
   from .env so they are configuration rather than numbers hidden in code, and
   the checkout screen labels them as sample rates. Weight comes from the
   item, never invented. */
const SHIPPING = {
  standard: { base: Number(process.env.SHIPP_STANDARD || 4.99), perLb: Number(process.env.SHIPP_PER_LB || 0.5), freeOver: Number(process.env.SHIPP_FREE_OVER || 75) },
  express: { base: Number(process.env.SHIPP_EXPRESS || 14.99), perLb: Number(process.env.SHIPP_EXPRESS_PER_LB || 1.2) },
  overnight: { base: Number(process.env.SHIPP_OVERNIGHT || 29.99), perLb: Number(process.env.SHIPP_OVERNIGHT_PER_LB || 1.8) },
};

function shippingQuote(items, method) {
  const weight = items.reduce((s, i) => s + (i.weightLb || 0) * i.qty, 0);
  const hasPhysical = items.some((i) => i.edition === 'physical' || (i.kind || 'game') === 'toy');
  if (!hasPhysical) return { cost: 0, weight, rate: 'digital delivery — no shipping' };
  const subtotal = items.reduce((s, i) => s + (i.unitPrice || 0) * i.qty, 0);
  const rate = SHIPPING[method] || SHIPPING.standard;
  let cost;
  let label;
  if (method === 'standard' && rate.freeOver && subtotal > rate.freeOver) {
    cost = 0;
    label = `free over $${rate.freeOver.toFixed(2)}`;
  } else {
    cost = rate.base + weight * rate.perLb;
    label = `$${rate.base.toFixed(2)} + $${rate.perLb.toFixed(2)}/lb`;
  }
  return { cost: +cost.toFixed(2), weight: +weight.toFixed(2), rate: label, sampleRate: true };
}

router.get('/checkout/summary', needLogin, async (req, res) => {
  await consumeCartClear(req);
  const items = getCart(req);
  const method = req.query.method || 'standard';
  const quote = shippingQuote(items, method);
  const cost = quote.cost;
  const subtotal = +items.reduce((s, i) => s + (i.unitPrice || 0) * i.qty, 0).toFixed(2);
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const user = await User.findById(req.session.user._id).lean();
  res.json({ items, subtotal, tax, shipCost: cost, grand: +(subtotal + tax + cost).toFixed(2), method, quote, taxRate: TAX_RATE, addresses: user.addresses || [] });
});

/* Fulfil a paid order: obtain one key per digital unit, draw down physical and
 * toy stock, credit the developer, and add everything to the buyer's library.
 *
 * There is no key inventory. Keys are obtained from the supplier at this
 * moment (lib/keyProvider.js) — never at checkout, because an abandoned
 * basket must not have taken anything.
 *
 * Idempotent: the order is marked 'paid' first, so a retry (a second callback,
 * a double click) returns early instead of issuing keys twice. Physical and toy
 * stock are decremented with a guarded findOneAndUpdate, which is atomic without
 * a replica set, and anything already taken before a later failure is put back;
 * keys already issued are revoked rather than returned. */
async function fulfilOrder(order) {
  if (!order || order.status !== 'pending') return { ok: true, already: true };

  // mark first so a concurrent retry cannot start a second fulfilment
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, status: 'pending' },
    { $set: { status: 'paid', paidAt: new Date() } },
    { new: true },
  );
  if (!claimed) return { ok: true, already: true };
  order = claimed;

  const issuedKeyIds = [];
  const decPhys = [];
  const decToys = [];
  const devPayouts = [];
  try {
    for (const it of order.items) {
      if (it.kind === 'toy') {
        const t = await Toy.findOneAndUpdate(
          { _id: it.toy, stock: { $gte: it.qty } },
          { $inc: { stock: -it.qty, 'stats.unitsSold': it.qty } },
          { new: true },
        );
        if (!t) throw new Error(`${it.title} is out of stock.`);
        decToys.push({ toyId: t._id, qty: it.qty });
        await Toy.updateOne({ _id: t._id }, { $inc: { 'stats.revenueGross': +(it.unitPrice * it.qty).toFixed(2) } });
        it.shipmentId = undefined;
        continue;
      }

      const g = await Game.findById(it.game);
      if (!g) throw new Error(`${it.title} is no longer listed.`);

      if (it.edition === 'physical') {
        const updated = await Game.findOneAndUpdate(
          { _id: g._id, 'physical.stock': { $gte: it.qty } },
          { $inc: { 'physical.stock': -it.qty, 'stats.unitsPhysical': it.qty } },
          { new: true },
        );
        if (!updated) throw new Error(`${g.title} physical stock insufficient.`);
        decPhys.push({ gameId: g._id, qty: it.qty });
      } else if (it.unitPrice > 0) {
        /* No inventory to claim from. The key is obtained now, against this
           paid order. If the supplier is unreachable this throws and the catch
           below handles the order — see lib/keyProvider.js for why a failure
           must not be papered over with a locally generated key. */
        const { source, keys } = await issueKeys({
          game: g._id, edition: it.edition, orderId: order._id, qty: it.qty,
        });
        for (const plain of keys) {
          const doc = await GameKey.issue(g._id, plain, {
            orderId: order._id, userId: order.user, source,
          });
          issuedKeyIds.push(doc._id);
          it.keyIds.push(doc._id);
        }
        await Game.updateOne({ _id: g._id }, { $inc: { 'stats.unitsDigital': it.qty, 'stats.keysSold': it.qty } });
      } else {
        await Game.updateOne({ _id: g._id }, { $inc: { 'stats.unitsDigital': it.qty } });
      }

      const gross = +(it.unitPrice * it.qty).toFixed(2);
      await Game.updateOne({ _id: g._id }, { $inc: { 'stats.revenueGross': gross } });
      devPayouts.push({ developer: g.developer, game: g._id, gross, cut: +(gross * DEV_CUT).toFixed(2) });
      await User.updateOne({ _id: g.developer }, { $inc: { 'devProfile.balanceOwed': +(gross * DEV_CUT).toFixed(2) } });
    }
  } catch (e) {
    /* Keys issued before the failure are revoked rather than returned to a
       shelf — there is no shelf. A buyer must never see a revoked key as
       still theirs, and nothing may sit in the collection looking available. */
    if (issuedKeyIds.length) {
      await GameKey.updateMany({ _id: { $in: issuedKeyIds } },
        { $set: { status: 'revoked', order: null, user: null } });
    }
    for (const r of decPhys) await Game.updateOne({ _id: r.gameId }, { $inc: { 'physical.stock': r.qty, 'stats.unitsPhysical': -r.qty } });
    for (const r of decToys) await Toy.updateOne({ _id: r.toyId }, { $inc: { stock: r.qty, 'stats.unitsSold': -r.qty } });
    // keep the items as a record of what was attempted, but drop the key
    // references that were just revoked
    await Order.updateOne(
      { _id: order._id },
      { $set: { status: 'failed', failureReason: e.message } },
    );
    await Order.updateOne({ _id: order._id }, { $set: { 'items.$[].keyIds': [] } });
    return { ok: false, error: e.message };
  }

  /* Mutating it.keyIds on a loaded document changes nothing on disk — Mongoose
   will not write a subdocument array back on its own. Without this the order is
   paid and the inventory has moved, but the order records no key. */
  await Order.updateOne(
    { _id: order._id },
    { $set: { items: order.items.map((it) => (typeof it.toObject === 'function' ? it.toObject() : it)) } },
  );
  if (devPayouts.length) await Order.updateOne({ _id: order._id }, { $set: { devPayouts } });

  const user = await User.findById(order.user);
  if (user) {
    for (const it of order.items) {
      if (it.kind === 'toy') {
        const has = (user.toyLibrary || []).some((e) => String(e.toy) === String(it.toy));
        if (has) user.toyLibrary.find((e) => String(e.toy) === String(it.toy)).qty += it.qty;
        else user.toyLibrary.push({ toy: it.toy, qty: it.qty });
      } else if (!user.ownsGame(it.game)) {
        user.library.push({ game: it.game, edition: it.edition });
      }
    }
    if (!user.purchaseHistory.some((p) => String(p) === String(order._id))) user.purchaseHistory.push(order._id);
    await user.save();
  }
  return { ok: true };
}

/* Step 1 of the gateway flow: snapshot the basket into a pending order and
 * hand back a URL to send the shopper to. Nothing is reserved or claimed yet —
 * if they abandon the gateway, no stock is held. */
router.post('/checkout/place', needLogin, async (req, res) => {
  await consumeCartClear(req);
  const items = getCart(req);
  if (!items.length) return res.status(400).json({ error: 'Cart is empty' });
  const { method = 'standard', fullName, street, city, region, postal, country = 'US', phone, cardLast4 } = req.body;
  const hasPhysical = items.some((i) => i.edition === 'physical' || (i.kind || 'game') === 'toy');
  if (hasPhysical && (!fullName || !street || !city || !postal)) return res.status(400).json({ error: 'Shipping address incomplete.' });

  /* A second copy of a game the account already owns is not a purchase: the
     library keeps one entry, while the money leaves twice and a spare key is
     issued. Refuse before the order exists and drop the duplicate from the
     basket so the retry can go through with the rest of the cart. Checked
     before the catalog lookup: there is no point pricing a game that cannot
     be bought. */
  const ownedIds = new Set(
    ((await User.findById(req.session.user._id).select('library').lean())?.library || []).map((e) => String(e.game)),
  );
  const duplicates = items.filter(
    (i) => (i.kind || 'game') !== 'toy' && (i.edition || 'digital') === 'digital' && ownedIds.has(String(i.gameId)),
  );
  if (duplicates.length) {
    const titles = duplicates.map((i) => i.title);
    req.session.cart = items.filter((i) => !duplicates.includes(i));
    return res.status(409).json({
      error: `You already own ${titles.join(', ')}. Removed from your cart.`,
      code: 'already_owned',
      owned: duplicates.map((i) => ({ gameId: i.gameId, title: i.title })),
    });
  }

  /* Prices are local now: re-read the catalog and refuse a stale cart so the
     shopper reviews the current total instead of being charged an old one. */
  const gameIds = [...new Set(items.filter((i) => (i.kind || 'game') !== 'toy').map((i) => String(i.gameId)))].filter(isObjectId);
  const toyIds = [...new Set(items.filter((i) => (i.kind || 'game') === 'toy').map((i) => String(i.toyId)))].filter(isObjectId);
  const [priced, pricedToys] = await Promise.all([
    gameIds.length ? Game.find({ _id: { $in: gameIds } }).select('title price discountPct physical').lean() : [],
    toyIds.length ? Toy.find({ _id: { $in: toyIds } }).select('title price').lean() : [],
  ]);
  const gameById = new Map(priced.map((g) => [String(g._id), g]));
  const toyById = new Map(pricedToys.map((t) => [String(t._id), t]));
  const changes = [];
  for (const i of items) {
    if ((i.kind || 'game') === 'toy') {
      const t = toyById.get(String(i.toyId));
      if (!t) return res.status(409).json({ error: `${i.title} is no longer available.`, code: 'game_unavailable' });
      if (Math.abs(Number(t.price) - Number(i.unitPrice)) > 0.001) {
        changes.push({ key: i.key, title: t.title, was: i.unitPrice, now: t.price });
        i.unitPrice = t.price;
      }
    } else {
      const g = gameById.get(String(i.gameId));
      if (!g) return res.status(409).json({ error: `${i.title} is no longer available.`, code: 'game_unavailable' });
      const now = i.edition === 'physical'
        ? Number(g.physical?.price || g.price + 15)
        : +(g.price * (1 - (g.discountPct || 0) / 100)).toFixed(2);
      if (Math.abs(now - Number(i.unitPrice)) > 0.001) {
        changes.push({ key: i.key, title: g.title, was: i.unitPrice, now });
        i.unitPrice = now;
      }
    }
  }
  if (changes.length) {
    const moved = changes[0];
    return res.status(409).json({
      error: `${moved.title} is now $${Number(moved.now).toFixed(2)} (was $${Number(moved.was).toFixed(2)}). Review the total and try again.`,
      code: 'price_changed',
      changes,
    });
  }

  const subtotal = +items.reduce((s, i) => s + i.unitPrice * i.qty, 0).toFixed(2);
  const { cost: shipCost } = shippingQuote(items, method);
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const grandTotal = +(subtotal + tax + shipCost).toFixed(2);

  // stock is checked now so a basket that cannot be filled is rejected before
  // the shopper is sent to a gateway, but nothing is decremented yet
  for (const i of items) {
    if ((i.kind || 'game') === 'toy') {
      const t = await Toy.findById(i.toyId).lean();
      if (!t || t.stock < i.qty) return res.status(400).json({ error: `${i.title} is out of stock.` });
    } else if (i.edition === 'physical') {
      const g = await Game.findById(i.gameId).select('physical.stock').lean();
      if (!g || (g.physical?.stock || 0) < i.qty) return res.status(400).json({ error: `${i.title} physical stock insufficient.` });
    }
  }

  const orderItems = items.map((i) => ({
    kind: i.kind || 'game',
    game: i.kind === 'toy' ? undefined : i.gameId,
    toy: i.kind === 'toy' ? i.toyId : undefined,
    title: i.title,
    edition: i.edition || 'digital',
    unitPrice: i.unitPrice,
    qty: i.qty,
    weightLb: i.weightLb || 0,
    keyIds: [],
  }));

  const tracking = hasPhysical
    ? 'PV-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100)
    : undefined;

  const order = await Order.create({
    user: req.session.user._id,
    items: orderItems,
    subtotal, discountTotal: 0, tax, shippingTotal: shipCost, grandTotal,
    status: 'pending',
    /* VNPay is a hosted gateway: the store never sees a card number, so there
       is no last4 unless a caller genuinely supplied one. */
    payment: { method: 'gateway', last4: cardLast4 ? String(cardLast4).slice(-4) : undefined },
    shipment: hasPhysical
      ? { tracking, method, cost: shipCost, address: { fullName, street, city, region, postal, country, phone }, status: 'packing' }
      : undefined,
    devPayouts: [],
  });

  const gatewayOrderId = 'PV' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();
  /* Prices are kept in USD, but VNPay quotes VND. Convert here, once, at the
     boundary: `vnp_Amount` is the smallest VND unit (dong x 100), so a $92.86
     order becomes 232,150,000 rather than 9,286. The rate is configuration,
     not a number hidden in code. */
  const gatewayAmount = Math.round(grandTotal * VND_PER_USD);
  const { url, provider, live } = gateway.createPaymentUrl({
    amount: gatewayAmount * 100,
    orderId: gatewayOrderId,
    orderInfo: `PixelVault order ${order._id}`,
    ipAddr: req.ip,
    returnUrl: `${req.protocol}://${req.get('host')}/payment/return`,
    bankCode: req.body.bankCode,
    locale: 'vn',
  });

  await Payment.create({
    orderId: gatewayOrderId,
    gatewayOrderId,
    user: req.session.user._id,
    order: order._id,
    amount: gatewayAmount,
    currency: 'VND',
    description: `PixelVault order ${order._id}`,
    provider,
    live,
    status: 'pending',
    bankCode: req.body.bankCode || '',
  });

  // keep the basket until the payment settles: a failed payment should let the
  // shopper retry without rebuilding the cart
  req.session.pendingPayment = gatewayOrderId;
  res.json({ ok: true, orderId: order._id, paymentUrl: url, provider, live, amount: grandTotal });
});

/* Settlement runs from the IPN too, where there is no request session. Mark
   the buyer in the database; the next cart/checkout request consumes the flag
   and clears the cookie-backed cart. */
async function consumeCartClear(req) {
  if (!req.session || !req.session.user) return;
  try {
    const u = await User.findOneAndUpdate(
      { _id: req.session.user._id, cartClearPending: true },
      { cartClearPending: false },
      { new: true },
    ).select('cartClearPending').lean();
    if (u) {
      req.session.cart = [];
      delete req.session.pendingPayment;
    }
  } catch (e) {
    console.error('[cart] clearing failed:', e.message);
  }
}

/* Shared by the browser redirect and the gateway's server-to-server notice.
 * Verifies the signature, then settles exactly once. */
async function settleFromCallback(query, source, req) {
  if (!gateway.verifyCallback(query)) return { ok: false, reason: 'invalid-signature' };

  const gatewayOrderId = String(query.vnp_TxnRef || '');
  const responseCode = String(query.vnp_ResponseCode || '');
  const transactionStatus = String(query.vnp_TransactionStatus || '');
  const transactionNo = String(query.vnp_TransactionNo || '');
  /* VNPay only calls a transaction successful when both the payment response
     and the transaction status are 00. Checking the response alone would settle
     a QR/authorisation step whose money has not actually moved. */
  const successful = responseCode === '00' && transactionStatus === '00';

  const payment = await Payment.findOne({ gatewayOrderId });
  if (!payment) return { ok: false, reason: 'unknown-payment' };

  /* The signature proves the gateway sent this callback, and the amount is part
     of what was signed. Compare it with the amount this store asked for: a
     callback for a different transaction must not settle this order. */
  if (successful && Number(query.vnp_Amount) !== Math.round(payment.amount) * 100) {
    return { ok: false, reason: 'amount-mismatch' };
  }

  // claim first: only one callback can move pending -> terminal
  const won = await Payment.claim(gatewayOrderId, {
    status: successful ? 'success' : 'failed',
    responseCode,
    gatewayTransactionNo: transactionNo,
    rawCallback: query,
    failureReason: successful ? '' : `gateway response ${responseCode}`,
  });

  if (!won) {
    const settled = await Payment.findOne({ gatewayOrderId }).lean();
    return {
      ok: settled.status === 'success',
      already: true,
      status: settled.status,
      orderId: settled.order,
      reason: 'already-settled',
      source,
    };
  }

  const order = await Order.findById(won.order);
  if (!order) return { ok: false, reason: 'order-missing' };

  if (!successful) {
    await Order.updateOne({ _id: order._id, status: 'pending' }, { $set: { status: 'cancelled' } });
    return { ok: false, status: 'failed', reason: `gateway response ${responseCode}`, orderId: order._id, source };
  }

  const done = await fulfilOrder(order);

  // Empty the basket only once the money is actually confirmed. The IPN has
  // no request session, so mark the buyer in the database; the next cart or
  // checkout request consumes the flag and clears the cookie-backed cart. On
  // failure the cart is deliberately kept, so a declined card can be retried.
  if (done.ok) {
    await User.updateOne({ _id: order.user }, { cartClearPending: true });
    if (req && req.session && req.session.user &&
        String(req.session.user._id) === String(order.user)) {
      req.session.cart = [];
      delete req.session.pendingPayment;
    }
  }

  return {
    ok: !!done.ok,
    already: !!done.already,
    status: done.ok ? 'success' : 'failed',
    error: done.error,
    orderId: order._id,
    live: won.live,
    source,
  };
}

router.get('/payment/return', async (req, res) => {
  const result = await settleFromCallback(req.query, 'return', req);
  // the SPA reads this; a gateway callback must never be redirected as JSON
  res.json(result);
});

router.get('/payment/ipn', async (req, res) => {
  // no session here — it is a server-to-server notice
  const result = await settleFromCallback(req.query, 'ipn', null);
  res.json({ RspCode: result.reason === 'invalid-signature' ? '97' : '00', Message: result.reason || result.status, ...result });
});

router.get('/payment/:gatewayOrderId', needLogin, async (req, res) => {
  const p = await Payment.findOne({ gatewayOrderId: req.params.gatewayOrderId, user: req.session.user._id }).lean();
  if (!p) return res.status(404).json({ error: 'Payment not found' });
  res.json({
    payment: {
      status: p.status, amount: p.amount, provider: p.provider, live: p.live,
      responseCode: p.responseCode, transactionNo: p.gatewayTransactionNo,
      createdAt: p.createdAt, settledAt: p.settledAt, orderId: p.order,
    },
  });
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
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Order not found' });
  const order = await Order.findById(req.params.id).populate('items.game').populate('items.toy').populate('items.keyIds').lean();
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (String(order.user) !== String(req.session.user._id) && req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  res.json({ order, plainById: withPlainKeys(order) });
});

/* A pending order holds nothing yet, so the shopper can abandon it without
   emailing support. Anything paid has already issued keys or drawn stock, so
   it is deliberately refused here — that path needs a refund flow instead. */
router.post('/orders/:id/cancel', needLogin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Order not found' });
  const order = await Order.findOne({ _id: req.params.id, user: req.session.user._id });
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'pending') return res.status(400).json({ error: `Order is ${order.status}; only pending orders can be cancelled.` });
  order.status = 'cancelled';
  await order.save();
  res.json({ ok: true, status: order.status });
});

// NOTE: a POST /orders/:id/advance route used to live here to step a shipment
// through packing -> shipped -> delivered. It had no UI, and no ownership check,
// so any signed-in user could rewrite someone else's shipment status. Removed.

// ---------- library ----------
router.get('/library', needLogin, async (req, res) => {
  const user = await User.findById(req.session.user._id).populate('library.game').populate('wishlist').populate('toyLibrary.toy').populate('toyWishlist').lean();
  // The library is the owner's view, but the hash is never part of it.
  delete user.passwordHash;
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
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Review not found' });
  const r = await Review.findById(req.params.id);
  if (!r) return res.status(404).json({ error: 'Review not found' });
  const uid = req.session.user._id;
  if (r.helpful.map(String).includes(String(uid))) r.helpful.pull(uid); else r.helpful.push(uid);
  await r.save();
  // after the toggle, membership of the list IS the "voted" state
  res.json({ ok: true, helpful: r.helpful.length, voted: r.helpful.map(String).includes(String(uid)) });
});

router.post('/reviews/:id/respond', needLogin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Review not found' });
  const r = await Review.findById(req.params.id).populate('game');
  if (!r) return res.status(404).json({ error: 'Review not found' });
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
  /* A public profile is not a copy of the account document. Contact details,
     wallet, address book and play history belong to the owner only; the hash
     must never leave the server for anyone. */
  delete user.passwordHash;
  if (!isSelf) {
    delete user.email;
    delete user.phone;
    delete user.wallet;
    delete user.addresses;
    delete user.playHistory;
    delete user.purchaseHistory;
    if (user.devProfile) {
      delete user.devProfile.payoutEmail;
      delete user.devProfile.balanceOwed;
    }
  }
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
  const user = await User.findById(req.session.user._id).select('role devProfile').lean();
  if (!user) return res.status(401).json({ error: 'Login required' });
  if (user.role === 'developer' || user.role === 'admin') return res.status(400).json({ error: 'Developer access already granted.' });
  if (user.devProfile?.studioName && user.devProfile?.verified === false) return res.status(409).json({ error: 'Application already pending review.' });
  await User.updateOne({ _id: req.session.user._id }, {
    devProfile: { studioName, website, payoutEmail, verified: false, balanceOwed: 0, requestedAt: new Date() },
  });
  res.json({ ok: true, pending: true });
});

router.get('/dev/status', needLogin, async (req, res) => {
  const u = await User.findById(req.session.user._id).select('role devProfile').lean();
  res.json({
    role: u.role,
    pending: u.role === 'user' && !!u.devProfile?.studioName && !u.devProfile?.verified,
    studioName: u.devProfile?.studioName || '',
  });
});

router.get('/dev', needDev, async (req, res) => {
  const games = await Game.find({ developer: req.session.user._id }).lean();
  const gameIds = games.map((g) => g._id);
  const gameIdSet = new Set(gameIds.map(String));
  const orders = await Order.find({ 'devPayouts.game': { $in: gameIds } }).lean();
  let gross = 0, devCut = 0, unitsD = 0, unitsP = 0;
  const monthly = {}; const byGame = {}; const byCountry = {};
  for (const o of orders) {
    const m = new Date(o.createdAt).toISOString().slice(0, 7);
    for (const p of o.devPayouts) {
      if (!gameIdSet.has(String(p.game))) continue;
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
      // Optional metadata is stored only when the developer supplies it.
      // Defaulting these to plausible numbers would put invented data on a
      // storefront, and a defaulted rating would silently no-op the
      // "hide mature titles" preference that reads this field.
      fileSizeGB: b.fileSizeGB === '' || b.fileSizeGB === undefined ? undefined : Number(b.fileSizeGB),
      version: b.version || undefined,
      physical: { enabled: !!b.physicalEnabled, price: Number(b.physicalPrice || 0), stock: Number(b.physicalStock || 0), weightLb: Number(b.weightLb || 0), warehouse: b.warehouse || '', includes: b.physicalIncludes || [] },
      rating: b.rating || undefined, status: 'published', releaseDate: b.releaseDate ? new Date(b.releaseDate) : new Date(),
    });
    res.json({ ok: true, slug: game.slug });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/dev/payout', needDev, async (req, res) => {
  const meU = await User.findById(req.session.user._id);
  const amount = Number(meU.devProfile?.balanceOwed || 0);
  if (amount < 10) return res.status(400).json({ error: 'Minimum $10 payout.' });
  await Payout.create({ developer: meU._id, amount });
  meU.devProfile.balanceOwed = 0;
  await meU.save();
  res.json({ ok: true, amount, status: 'pending' });
});

router.post('/dev/:id/edit', needDev, async (req, res) => {
  const game = await Game.findOne({ _id: req.params.id, developer: req.session.user._id });
  if (!game) return res.status(404).json({ error: 'Not found' });
  const patch = {};
  if (req.body.title !== undefined) patch.title = String(req.body.title).slice(0, 120);
  if (req.body.tagline !== undefined) patch.tagline = String(req.body.tagline).slice(0, 200);
  if (req.body.description !== undefined) patch.description = String(req.body.description).slice(0, 5000);
  if (req.body.coverImage !== undefined) patch.coverImage = String(req.body.coverImage);
  if (req.body.genres !== undefined) patch.genres = splitList(req.body.genres, 'Indie');
  if (req.body.tags !== undefined) patch.tags = splitList(req.body.tags);
  if (req.body.price !== undefined) patch.price = Math.max(0, Number(req.body.price) || 0);
  if (req.body.discountPct !== undefined) patch.discountPct = Math.min(90, Math.max(0, Number(req.body.discountPct) || 0));
  if (['draft', 'published', 'delisted'].includes(req.body.status)) patch.status = req.body.status;
  if (req.body.physicalStock !== undefined) patch['physical.stock'] = Math.max(0, Number(req.body.physicalStock) || 0);
  await Game.updateOne({ _id: game._id }, patch);
  res.json({ ok: true });
});

router.delete('/dev/:id', needDev, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const game = await Game.findOne({ _id: req.params.id, developer: req.session.user._id });
  if (!game) return res.status(404).json({ error: 'Not found' });
  await Promise.all([
    GameKey.deleteMany({ game: game._id }),
    Review.deleteMany({ game: game._id }),
    Post.deleteMany({ game: game._id }),
    User.updateMany({}, { $pull: { wishlist: game._id, library: { game: game._id } } }),
  ]);
  await Game.deleteOne({ _id: game._id });
  res.json({ ok: true });
});

/* Keys are not stocked, so there is nothing to manage here. What a publisher
 * can see is which keys their game has actually issued, and to revoke one
 * after the fact if it leaks. */
router.get('/dev/:id/keys', needDev, async (req, res) => {
  const game = await Game.findOne({ _id: req.params.id, developer: req.session.user._id }).lean();
  if (!game) return res.status(404).json({ error: 'Not found' });
  const [sold, revoked] = await Promise.all([
    GameKey.countDocuments({ game: game._id, status: 'sold' }),
    GameKey.countDocuments({ game: game._id, status: 'revoked' }),
  ]);
  res.json({ game, sold, revoked, supplier: supplierConfigured() });
});

// Masked key list — never returns plaintext (owners never need it on this screen).
router.get('/dev/:id/keys/list', needDev, async (req, res) => {
  const game = await Game.findOne({ _id: req.params.id, developer: req.session.user._id }).lean();
  if (!game) return res.status(404).json({ error: 'Not found' });
  const lim = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const keys = await GameKey.find({ game: game._id }).sort({ createdAt: -1 }).limit(lim).lean();
  // codeEnc is iv.tag.data — mask to last 4 chars of the data segment.
  res.json({ keys: keys.map((k) => ({ _id: k._id, status: k.status, source: k.source, platform: k.platform, soldAt: k.soldAt, mask: '••••-••••-••••-' + String(k.codeEnc || '').split('.').pop().slice(-4) })) });
});

/* Revoke a key that has already been sold. This is the only thing that can be
   done to a key: there is no shelf to pull it off. The buyer must not be able
   to reveal it again afterwards. */
router.post('/dev/:id/keys/:keyId/revoke', needDev, async (req, res) => {
  const game = await Game.findOne({ _id: req.params.id, developer: req.session.user._id }).lean();
  if (!game) return res.status(404).json({ error: 'Not found' });
  const k = await GameKey.findOne({ _id: req.params.keyId, game: game._id });
  if (!k) return res.status(404).json({ error: 'Key not found' });
  if (k.status === 'revoked') return res.json({ ok: true });
  k.status = 'revoked';
  await k.save();
  res.json({ ok: true });
});

router.get('/dev/toys', needDev, async (req, res) => {
  /* A developer manages their own listings only; the store account (admin)
     sees the shared shelf. Store-owned toys have seller: null. */
  const filter = req.session.user.role === 'admin' ? {} : { seller: req.session.user._id };
  const toys = await Toy.find(filter).sort({ title: 1 }).lean();
  res.json({ toys });
});

router.post('/dev/toys/:id/restock', needDev, async (req, res) => {
  const patch = {};
  if (req.body.stock !== undefined) patch.stock = Math.max(0, Math.min(9999, Number(req.body.stock) || 0));
  if (req.body.price !== undefined) patch.price = Math.max(0, Number(req.body.price) || 0);
  const filter = { _id: req.params.id };
  if (req.session.user.role !== 'admin') filter.seller = req.session.user._id;
  const t = await Toy.findOne(filter);
  if (!t) return res.status(404).json({ error: 'Not found' });
  await Toy.updateOne({ _id: t._id }, patch);
  res.json({ ok: true });
});

// ---------- community (read + post) ----------
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

// ---------- admin ----------
router.get('/admin', needAdmin, async (req, res) => {
  const [orders, posts, reviews, users, games, toys, payments, devRequests, payouts, spendRows, userCount, gameCount, toyCount, revenueAgg] = await Promise.all([
    Order.find({}).populate('user', 'username email').sort({ createdAt: -1 }).limit(100).lean(),
    Post.find({}).populate('author', 'username').sort({ createdAt: -1 }).limit(60).lean(),
    Review.find({}).populate('user', 'username').populate('game', 'title slug').sort({ createdAt: -1 }).limit(60).lean(),
    User.find({}).select('username email role createdAt isBanned').sort({ createdAt: -1 }).limit(200).lean(),
    Game.find({}).populate('developer', 'username').select('title slug price discountPct status stats developer featured coverImage genres tags description createdAt').sort({ createdAt: -1 }).limit(300).lean(),
    Toy.find({}).select('title slug price stock stats status seller category brand coverImage').sort({ title: 1 }).limit(300).lean(),
    Payment.find({}).populate('user', 'username').select('orderId gatewayOrderId user order amount currency provider live status responseCode createdAt settledAt').sort({ createdAt: -1 }).limit(100).lean(),
    User.find({ role: 'user', 'devProfile.studioName': { $exists: true, $ne: '' }, 'devProfile.verified': { $ne: true } })
      .select('username email devProfile createdAt').sort({ 'devProfile.requestedAt': 1, createdAt: 1 }).lean(),
    Payout.find({}).populate('developer', 'username email').sort({ requestedAt: -1 }).limit(100).lean(),
    Order.aggregate([
      { $match: { status: { $in: ['paid', 'fulfilled', 'partially_shipped', 'shipped', 'delivered'] } } },
      { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$grandTotal' } } },
    ]),
    User.countDocuments(),
    Game.countDocuments(),
    Toy.countDocuments(),
    Order.aggregate([{ $match: { status: { $in: ['paid', 'fulfilled', 'partially_shipped', 'shipped', 'delivered'] } } }, { $group: { _id: null, sum: { $sum: '$grandTotal' } } }]),
  ]);
  const spendById = new Map(spendRows.map((r) => [String(r._id), r]));
  const usersWithSpend = users.map((u) => ({
    ...u,
    orders: spendById.get(String(u._id))?.orders || 0,
    spent: spendById.get(String(u._id))?.spent || 0,
  }));
  const stats = {
    users: userCount, games: gameCount, toys: toyCount,
    revenue: revenueAgg[0]?.sum || 0,
    devRequests: devRequests.length,
    pendingPayouts: payouts.filter((p) => p.status === 'pending').length,
  };
  res.json({ orders, posts, reviews, users: usersWithSpend, games, toys, payments, devRequests, payouts, stats });
});

router.get('/admin/users/:id', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'User not found' });
  const user = await User.findById(req.params.id)
    .select('username email role isBanned createdAt library wishlist toyWishlist')
    .populate('library.game', 'title slug coverImage price')
    .populate('wishlist', 'title slug coverImage')
    .populate('toyWishlist', 'title slug coverImage')
    .lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  const orders = await Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(20).lean();
  const spent = orders
    .filter((o) => ['paid', 'fulfilled', 'partially_shipped', 'shipped', 'delivered'].includes(o.status))
    .reduce((s, o) => s + Number(o.grandTotal || 0), 0);
  res.json({ user, orders, spent });
});

router.post('/admin/users/:id/role', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'User not found' });
  const role = String(req.body.role || '');
  if (!['user', 'developer', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (String(u._id) === String(req.session.user._id) && role !== 'admin') {
    return res.status(400).json({ error: 'You cannot remove your own admin access.' });
  }
  if (u.role === 'admin' && role !== 'admin' && (await User.countDocuments({ role: 'admin' })) <= 1) {
    return res.status(400).json({ error: 'At least one admin must remain.' });
  }
  u.role = role;
  if (role === 'developer') {
    if (!u.devProfile) u.devProfile = {};
    u.devProfile.verified = true;
  }
  await u.save();
  if (String(u._id) === String(req.session.user._id)) req.session.user.role = role;
  res.json({ ok: true, role: u.role });
});

router.post('/admin/games/:id/status', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Game not found' });
  const status = String(req.body.status || '');
  if (!['published', 'draft', 'delisted'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const g = await Game.findById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Game not found' });
  g.status = status;
  await g.save();
  res.json({ ok: true, status: g.status });
});

router.post('/admin/devs/:id/approve', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'User not found' });
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (!u.devProfile?.studioName) return res.status(400).json({ error: 'No developer application.' });
  u.role = 'developer';
  u.devProfile.verified = true;
  u.devProfile.requestedAt = null;
  await u.save();
  res.json({ ok: true });
});

router.post('/admin/devs/:id/reject', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'User not found' });
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.role === 'admin') return res.status(400).json({ error: 'Cannot reject an admin.' });
  await User.updateOne({ _id: u._id }, { $unset: { devProfile: 1 } });
  res.json({ ok: true });
});

/* ---------- owner account controls ---------- */
router.post('/admin/users', needAdmin, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { username, email, password, role = 'user' } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'Username, email and password are required.' });
    if (!['user', 'developer', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
    const exists = await User.findOne({ $or: [{ email: String(email).toLowerCase() }, { username }] });
    if (exists) return res.status(409).json({ error: 'Username or email already exists.' });
    const passwordHash = await bcrypt.hash(password, 10);
    const u = await User.create({
      username, email: String(email).toLowerCase(), passwordHash, role,
      ...(role === 'developer' ? { devProfile: { studioName: username, verified: true, balanceOwed: 0 } } : {}),
    });
    res.json({ ok: true, user: { _id: u._id, username: u.username, email: u.email, role: u.role } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/admin/users/:id', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'User not found' });
  if (String(req.params.id) === String(req.session.user._id)) return res.status(400).json({ error: 'You cannot delete your own account.' });
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.role === 'admin' && (await User.countDocuments({ role: 'admin' })) <= 1) {
    return res.status(400).json({ error: 'At least one admin must remain.' });
  }
  await Promise.all([Post.deleteMany({ author: u._id }), Review.deleteMany({ user: u._id })]);
  await User.deleteOne({ _id: u._id });
  res.json({ ok: true });
});

router.post('/admin/users/:id/grant-game', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'User not found' });
  if (!isObjectId(req.body.gameId)) return res.status(400).json({ error: 'Game required.' });
  const [u, g] = await Promise.all([
    User.findById(req.params.id),
    Game.findById(req.body.gameId).select('title slug price'),
  ]);
  if (!u || !g) return res.status(404).json({ error: 'User or game not found.' });
  if ((u.library || []).some((e) => String(e.game) === String(g._id))) {
    return res.status(409).json({ error: 'User already owns this game.' });
  }
  u.library.push({ game: g._id, edition: 'digital', purchasedAt: new Date(), playMinutes: 0, achievements: [] });
  await u.save();
  res.json({ ok: true, game: { _id: g._id, title: g.title } });
});

/* Refund decision: restore stock, revoke issued keys, remove the games from
   the buyer's library, and reverse the developer credit. */
router.post('/admin/orders/:id/refund', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Order not found' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['paid', 'fulfilled', 'partially_shipped', 'shipped', 'delivered'].includes(order.status)) {
    return res.status(400).json({ error: `Order is ${order.status}; only paid orders can be refunded.` });
  }
  for (const it of order.items) {
    if (it.kind === 'toy' && it.toy) await Toy.updateOne({ _id: it.toy }, { $inc: { stock: it.qty } });
    if (it.kind !== 'toy' && it.edition === 'physical' && it.game) await Game.updateOne({ _id: it.game }, { $inc: { 'physical.stock': it.qty } });
  }
  await GameKey.updateMany({ order: order._id }, { $set: { status: 'revoked' } });
  const gameIds = order.items.filter((i) => i.game).map((i) => i.game);
  if (gameIds.length) await User.updateOne({ _id: order.user }, { $pull: { library: { game: { $in: gameIds } } } });
  for (const p of order.devPayouts || []) {
    if (p.developer) await User.updateOne({ _id: p.developer }, { $inc: { 'devProfile.balanceOwed': -Number(p.cut || 0) } });
  }
  order.status = 'refunded';
  order.refundedAt = new Date();
  await order.save();
  res.json({ ok: true, status: order.status });
});

router.delete('/admin/games/:id', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Game not found' });
  const g = await Game.findById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Game not found' });
  /* Orders keep their title/price snapshot, so historical receipts survive.
     Keys, reviews, forum threads and user shelves must go with the title. */
  await Promise.all([
    GameKey.deleteMany({ game: g._id }),
    Review.deleteMany({ game: g._id }),
    Post.deleteMany({ game: g._id }),
    User.updateMany({}, { $pull: { wishlist: g._id, library: { game: g._id } } }),
  ]);
  await Game.deleteOne({ _id: g._id });
  res.json({ ok: true });
});

router.delete('/admin/toys/:id', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Toy not found' });
  const t = await Toy.findById(req.params.id);
  if (!t) return res.status(404).json({ error: 'Toy not found' });
  await User.updateMany({}, { $pull: { toyWishlist: t._id, toyLibrary: { toy: t._id } } });
  await Toy.deleteOne({ _id: t._id });
  res.json({ ok: true });
});

/* ---------- admin catalog + owner controls ---------- */
function splitList(v, fallback = '') {
  const rows = Array.isArray(v) ? v : String(v || '').split(',');
  const out = rows.map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
  if (!out.length && fallback) out.push(fallback);
  return out;
}

router.post('/admin/games', needAdmin, async (req, res) => {
  try {
    const b = req.body;
    if (!b.title || b.price === undefined) return res.status(400).json({ error: 'Title and price are required.' });
    const game = await Game.create({
      title: String(b.title).slice(0, 120),
      tagline: String(b.tagline || '').slice(0, 200),
      description: String(b.description || '').slice(0, 5000),
      developer: req.session.user._id,
      studioName: b.studioName || 'PixelVault',
      genres: splitList(b.genres, 'Indie'),
      tags: splitList(b.tags),
      platforms: ['Windows'],
      coverImage: String(b.coverImage || ''),
      price: Math.max(0, Number(b.price) || 0),
      discountPct: Math.min(90, Math.max(0, Number(b.discountPct) || 0)),
      featured: !!b.featured,
      status: ['published', 'draft', 'delisted'].includes(b.status) ? b.status : 'published',
      releaseDate: new Date(),
    });
    res.json({ ok: true, game: { _id: game._id, title: game.title, slug: game.slug } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/admin/games/:id', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Game not found' });
  const g = await Game.findById(req.params.id);
  if (!g) return res.status(404).json({ error: 'Game not found' });
  const b = req.body;
  if (b.title !== undefined) g.title = String(b.title).slice(0, 120);
  if (b.tagline !== undefined) g.tagline = String(b.tagline).slice(0, 200);
  if (b.description !== undefined) g.description = String(b.description).slice(0, 5000);
  if (b.price !== undefined) g.price = Math.max(0, Number(b.price) || 0);
  if (b.discountPct !== undefined) g.discountPct = Math.min(90, Math.max(0, Number(b.discountPct) || 0));
  if (b.coverImage !== undefined) g.coverImage = String(b.coverImage);
  if (b.genres !== undefined) g.genres = splitList(b.genres, 'Indie');
  if (b.tags !== undefined) g.tags = splitList(b.tags);
  if (b.status !== undefined && ['published', 'draft', 'delisted'].includes(b.status)) g.status = b.status;
  if (b.featured !== undefined) g.featured = !!b.featured;
  await g.save();
  res.json({ ok: true, game: { _id: g._id, title: g.title, slug: g.slug } });
});

router.post('/admin/toys', needAdmin, async (req, res) => {
  try {
    const b = req.body;
    if (!b.title || b.price === undefined) return res.status(400).json({ error: 'Title and price are required.' });
    const toy = await Toy.create({
      title: String(b.title).slice(0, 120),
      brand: String(b.brand || ''),
      category: ['Plush', 'Figure', 'Statue', 'Apparel', 'Book', 'Music', 'Pins', 'Other'].includes(b.category) ? b.category : 'Other',
      price: Math.max(0, Number(b.price) || 0),
      stock: Math.max(0, Math.min(9999, Number(b.stock) || 0)),
      weightLb: Math.max(0.1, Number(b.weightLb) || 1),
      description: String(b.description || ''),
      coverImage: String(b.coverImage || ''),
      status: 'published',
      seller: null,
    });
    res.json({ ok: true, toy: { _id: toy._id, title: toy.title, slug: toy.slug } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/admin/toys/:id', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Toy not found' });
  const toy = await Toy.findById(req.params.id).lean();
  if (!toy) return res.status(404).json({ error: 'Toy not found' });
  const orders = await Order.find({ 'items.toy': toy._id }).sort({ createdAt: -1 }).limit(10).lean();
  res.json({ toy, orders });
});

router.post('/admin/toys/:id', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Toy not found' });
  const t = await Toy.findById(req.params.id);
  if (!t) return res.status(404).json({ error: 'Toy not found' });
  const b = req.body;
  if (b.title !== undefined) t.title = String(b.title).slice(0, 120);
  if (b.brand !== undefined) t.brand = String(b.brand).slice(0, 80);
  if (b.category !== undefined && ['Plush', 'Figure', 'Statue', 'Apparel', 'Book', 'Music', 'Pins', 'Other'].includes(b.category)) t.category = b.category;
  if (b.price !== undefined) t.price = Math.max(0, Number(b.price) || 0);
  if (b.stock !== undefined) t.stock = Math.max(0, Math.min(9999, Number(b.stock) || 0));
  if (b.weightLb !== undefined) t.weightLb = Math.max(0.1, Number(b.weightLb) || 1);
  if (b.description !== undefined) t.description = String(b.description).slice(0, 4000);
  if (b.coverImage !== undefined) t.coverImage = String(b.coverImage);
  if (b.status !== undefined && ['published', 'hidden', 'soldout'].includes(b.status)) t.status = b.status;
  await t.save();
  res.json({ ok: true, toy: { _id: t._id, title: t.title, slug: t.slug } });
});

router.post('/admin/users/:id/ban', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'User not found' });
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.role === 'admin') return res.status(400).json({ error: 'Cannot suspend an admin.' });
  u.isBanned = !u.isBanned;
  await u.save();
  res.json({ ok: true, banned: u.isBanned });
});

router.post('/admin/users/:id/password', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'User not found' });
  const password = String(req.body.password || '');
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash(password, 10);
  const u = await User.findByIdAndUpdate(req.params.id, { passwordHash });
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

router.post('/admin/orders/:id/tracking', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Order not found' });
  const o = await Order.findById(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  if (!o.shipment) return res.status(400).json({ error: 'Digital order — there is nothing to ship.' });
  o.shipment.carrier = String(req.body.carrier || '').slice(0, 60);
  o.shipment.tracking = String(req.body.tracking || '').slice(0, 80);
  await o.save();
  res.json({ ok: true, shipment: o.shipment });
});

router.post('/admin/payouts/:id/pay', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Payout not found' });
  const p = await Payout.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Payout not found' });
  if (p.status !== 'pending') return res.status(400).json({ error: `Payout is already ${p.status}.` });
  p.status = 'paid';
  p.paidAt = new Date();
  p.note = String(req.body.note || '').slice(0, 200);
  await p.save();
  res.json({ ok: true });
});

router.post('/admin/payouts/:id/reject', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Payout not found' });
  const p = await Payout.findById(req.params.id);
  if (!p) return res.status(404).json({ error: 'Payout not found' });
  if (p.status !== 'pending') return res.status(400).json({ error: `Payout is already ${p.status}.` });
  p.status = 'rejected';
  p.note = String(req.body.note || '').slice(0, 200);
  await p.save();
  await User.updateOne({ _id: p.developer }, { $inc: { 'devProfile.balanceOwed': p.amount } });
  res.json({ ok: true });
});

/* packing -> shipped -> delivered. The buyer's order page reads the same
   shipment object, so one click here is visible there on the next load. */
router.post('/admin/orders/:id/advance', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Order not found' });
  const o = await Order.findById(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  if (!o.shipment) return res.status(400).json({ error: 'Digital order — there is nothing to ship.' });
  if (!['paid', 'shipped'].includes(o.status)) return res.status(400).json({ error: `Order is ${o.status}; only paid orders can be shipped.` });
  const flow = ['packing', 'shipped', 'delivered'];
  const at = flow.indexOf(o.shipment.status);
  if (at === -1) return res.status(400).json({ error: `Shipment is ${o.shipment.status}; this desk only moves packing → shipped → delivered.` });
  if (at === flow.length - 1) return res.status(400).json({ error: 'Shipment is already delivered.' });
  const next = flow[at + 1];
  o.shipment.status = next;
  if (next === 'shipped') { o.shipment.shippedAt = new Date(); o.status = 'shipped'; }
  if (next === 'delivered') { o.shipment.deliveredAt = new Date(); o.status = 'delivered'; }
  await o.save();
  res.json({ ok: true, status: o.status, shipment: o.shipment });
});

router.delete('/admin/posts/:id', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Post not found' });
  const p = await Post.findByIdAndDelete(req.params.id);
  if (!p) return res.status(404).json({ error: 'Post not found' });
  res.json({ ok: true });
});

router.delete('/admin/reviews/:id', needAdmin, async (req, res) => {
  if (!isObjectId(req.params.id)) return res.status(404).json({ error: 'Review not found' });
  const r = await Review.findByIdAndDelete(req.params.id);
  if (!r) return res.status(404).json({ error: 'Review not found' });
  const agg = await Review.aggregate([{ $match: { game: r.game } }, { $group: { _id: null, sum: { $sum: '$stars' }, n: { $sum: 1 } } }]);
  await Game.updateOne({ _id: r.game }, { $set: { 'stats.reviewSum': agg[0]?.sum || 0, 'stats.reviewCount': agg[0]?.n || 0 } });
  res.json({ ok: true });
});

router.get('/stats', async (req, res) => {
  const [games, orders, toys] = await Promise.all([Game.countDocuments({ status: 'published' }), Order.countDocuments(), Toy.countDocuments({ status: 'published' })]);
  res.json({ games, orders, toys, ok: true });
});

// Public client config (Google OAuth client id, when configured).
router.get('/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

// Login with Google (requires GOOGLE_CLIENT_ID in .env — see README).
// Verifies the ID token with Google, then finds or creates the account.
router.post('/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Missing ID token.' });
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const info = await r.json().catch(() => ({}));
    if (!r.ok || !info.email) return res.status(401).json({ error: 'Invalid Google token.' });
    const conf = process.env.GOOGLE_CLIENT_ID;
    if (conf && info.aud !== conf) return res.status(401).json({ error: 'Token audience mismatch.' });
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    let user = await User.findOne({ email: String(info.email).toLowerCase() });
    if (!user) {
      let base = String(info.email).split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 18) || 'vaultuser';
      let username = base, n = 0;
      while (await User.findOne({ username })) username = `${base}${++n}`;
      user = await User.create({
        username, email: String(info.email).toLowerCase(),
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
        displayName: String(info.name || '').slice(0, 40), avatar: String(info.picture || '').slice(0, 500),
      });
    } else if (info.picture && !user.avatar) {
      user.avatar = String(info.picture).slice(0, 500);
      await user.save();
    }
    req.session.user = { _id: user._id, username: user.username, role: user.role, email: user.email, avatar: user.avatar || '' };
    res.json({ user: me(req) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- safety net ----------
// Express 4 does not catch rejected promises from async handlers, so a bad
// request such as /api/orders/garbage threw a Mongoose CastError that became
// an unhandled rejection and killed the whole server. Wrap every handler so a
// throw lands in the error handler below instead.
router.stack.forEach((layer) => {
  if (!layer.route) return;
  layer.route.stack.forEach((s) => {
    const orig = s.handle;
    if (typeof orig !== 'function' || orig.length >= 4) return;
    s.handle = (req, res, next) => {
      try {
        const out = orig(req, res, next);
        if (out && typeof out.catch === 'function') out.catch(next);
      } catch (e) { next(e); }
    };
  });
});

// ---------- QR login ----------
// Web side creates a token and shows it as a QR code; phone side confirms it.
router.post('/qrlogin/request', async (req, res) => {
  try {
    const token = crypto.randomBytes(24).toString('base64url');
    /* The QR only carries the token. The browser that asked for it keeps a
       second secret in its signed cookie; activation must present both, so a
       leaked token alone cannot sign another browser in. */
    const browserSecret = crypto.randomBytes(24).toString('base64url');
    await QrLogin.create({ token, browserSecret });
    req.session.qrSecret = browserSecret;
    res.json({ token, expiresIn: 90 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/qrlogin/status', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing token.' });
    const qr = await QrLogin.findOne({ token }).lean();
    if (!qr) return res.json({ status: 'expired' });
    res.json({ status: qr.status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* The phone is already signed in (its session cookie rides along). It scanned
   the code, so it can prove possession of the token and attach its user. */
router.post('/qrlogin/confirm', needLogin, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Missing token.' });
    const qr = await QrLogin.findOne({ token });
    if (!qr) return res.status(404).json({ error: 'QR code expired or invalid.' });
    if (qr.status !== 'pending') return res.status(409).json({ error: 'QR code already used.' });
    qr.status = 'confirmed';
    qr.user = req.session.user._id;
    await qr.save();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* The web page, still polling on its own session cookie, consumes the
   confirmed token and signs itself in. */
router.post('/qrlogin/activate', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Missing token.' });
    if (!req.session.qrSecret) return res.status(403).json({ error: 'Start the QR login from this browser.' });
    const qr = await QrLogin.findOne({ token });
    if (!qr) return res.status(404).json({ error: 'QR code expired or invalid.' });
    if (qr.status !== 'confirmed') return res.status(409).json({ error: 'Not confirmed yet.' });
    if (qr.browserSecret !== req.session.qrSecret) return res.status(403).json({ error: 'This QR code belongs to another browser.' });
    delete req.session.qrSecret;
    req.session.user = { _id: qr.user, username: '', role: 'user', email: '', avatar: '' };
    await QrLogin.deleteOne({ _id: qr._id });
    const user = await User.findById(qr.user).select('username role email avatar').lean();
    req.session.user = { _id: user._id, username: user.username, role: user.role, email: user.email, avatar: user.avatar || '' };
    res.json({ ok: true, user: me(req) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------- media (GridFS) ----------
// Images are stored in MongoDB GridFS and served here, so the storefront does
// not hotlink Steam's CDN. The URL is just /api/media/<fileId>.
/* Direct image upload for avatars and dev covers. The browser sends the file
   as the raw request body, so there is no multipart dependency; the bytes land
   in GridFS and the returned /api/media/<id> URL is what the rest of the app
   stores. */
router.post('/media', needLogin, express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
  try {
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = IMAGE_TYPES[mime];
    if (!ext) return res.status(400).json({ error: 'Only PNG, JPEG, WebP or GIF images are allowed.' });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'The uploaded file is empty.' });
    if (!looksLikeImage(req.body, mime)) return res.status(400).json({ error: 'The file content does not match its type.' });

    const kind = req.query.kind === 'cover' ? 'cover' : 'avatar';
    const bucket = getBucket();
    const filename = `${kind}-${req.session.user._id}-${Date.now()}.${ext}`;
    const upload = bucket.openUploadStream(filename, {
      contentType: mime,
      metadata: { owner: String(req.session.user._id), kind },
    });
    upload.end(req.body);
    await new Promise((resolve, reject) => {
      upload.on('finish', resolve);
      upload.on('error', reject);
    });

    const url = `/api/media/${upload.id}`;
    if (kind === 'avatar') {
      await User.updateOne({ _id: req.session.user._id }, { avatar: url });
      req.session.user.avatar = url;
    }
    res.json({ ok: true, url, id: String(upload.id), kind });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Upload failed.' });
  }
});

router.get('/media/:id', async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid image id.' });
    const bucket = getBucket();
    const id = new mongoose.Types.ObjectId(req.params.id);
    const files = await bucket.find({ _id: id }).toArray();
    if (!files.length) return res.status(404).end();
    res.set('Content-Type', files[0].contentType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    const stream = bucket.openDownloadStream(id);
    stream.on('error', () => { try { res.status(404).end(); } catch {} });
    stream.pipe(res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.use((req, res) => res.status(404).json({ error: `No API route for ${req.method} ${req.path}` }));

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Image is too large (max 5 MB).' });
  }
  if (err && err.name === 'CastError') {
    return res.status(400).json({ error: 'That id is not valid.' });
  }
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({ error: Object.values(err.errors || {}).map((e) => e.message).join(', ') || 'Invalid data.' });
  }
  const status = (err && err.status) || 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: (err && err.message) || 'Server error' });
});

module.exports = { router, isObjectId };
