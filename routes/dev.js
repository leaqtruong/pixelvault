const express = require('express');
const Game = require('../models/Game');
const Order = require('../models/Order');
const User = require('../models/User');
const { requireLogin, requireDev } = require('../middleware/auth');
const router = express.Router();

// Dev apply / onboarding
router.get('/apply', requireLogin, (req, res) => res.render('dev-apply', { error: null }));
router.post('/apply', requireLogin, async (req, res) => {
  const { studioName, website, payoutEmail } = req.body;
  if (!studioName || !payoutEmail) return res.render('dev-apply', { error: 'Studio + payout email required.' });
  await User.updateOne({ _id: req.session.user._id }, {
    role: 'developer',
    devProfile: { studioName, website, payoutEmail, verified: false, balanceOwed: 0 }
  });
  req.session.user.role = 'developer';
  res.redirect('/dev');
});

// Dev dashboard with revenue analytics
router.get('/', requireDev, async (req, res) => {
  const games = await Game.find({ developer: req.session.user._id }).lean();
  const gameIds = games.map(g => g._id);
  const orders = await Order.find({ 'devPayouts.game': { $in: gameIds } }).lean();

  let gross = 0, devCut = 0, unitsD = 0, unitsP = 0;
  const monthly = {}; // YYYY-MM -> gross
  const byGame = {};
  const byCountry = {};
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
  const me = await User.findById(req.session.user._id).lean();
  res.render('dev-dashboard', {
    games, gross, devCut, unitsD, unitsP,
    monthly: Object.entries(monthly).sort(),
    byGame, byCountry,
    balance: me.devProfile?.balanceOwed || 0
  });
});

// New game form + create
router.get('/new', requireDev, (req, res) => res.render('dev-game-form', { game: null, error: null }));
router.post('/new', requireDev, async (req, res) => {
  try {
    const b = req.body;
    const { STEAM_GENRES } = require('../lib/steamTaxonomy');
    let genres = String(b.genres || '').split(',').map(s => s.trim()).filter(Boolean);
    // keep genres Steam-aligned: drop unknown free-text, fallback to Indie
    if (genres.length) genres = genres.filter(g => STEAM_GENRES.includes(g));
    if (!genres.length && b.genres) genres = String(b.genres || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
    const game = await Game.create({
      title: b.title,
      tagline: b.tagline,
      description: b.description,
      developer: req.session.user._id,
      studioName: b.studioName || req.session.user.username,
      genres: genres.length ? genres : ['Indie'],
      tags: String(b.tags || '').split(',').map(s => s.trim()).filter(Boolean),
      platforms: Array.isArray(b.platforms) ? b.platforms : (b.platforms ? [b.platforms] : ['Windows']),
      features: String(b.features || '').split(',').map(s => s.trim()).filter(Boolean),
      coverImage: b.coverImage,
      screenshots: String(b.screenshots || '').split('\n').map(s => s.trim()).filter(Boolean),
      price: Number(b.price), discountPct: Number(b.discountPct || 0),
      fileSizeGB: Number(b.fileSizeGB || 5), version: b.version || '1.0.0',
      physical: {
        enabled: b.physicalEnabled === 'on',
        price: Number(b.physicalPrice || 0),
        stock: Number(b.physicalStock || 0),
        weightLb: Number(b.weightLb || 0.5),
        warehouse: b.warehouse || 'US-EAST',
        includes: String(b.physicalIncludes || '').split(',').map(s => s.trim()).filter(Boolean)
      },
      systemReq: { os: b.os, cpu: b.cpu, ram: b.ram, gpu: b.gpu, storage: b.storage },
      rating: b.rating || 'E',
      status: 'published',
      modSupport: b.modSupport !== 'off',
      releaseDate: b.releaseDate ? new Date(b.releaseDate) : new Date()
    });
    res.redirect(`/games/${game.slug}`);
  } catch (e) { res.render('dev-game-form', { game: req.body, error: e.message }); }
});

// Edit game + restock physical
router.get('/:id/edit', requireDev, async (req, res) => {
  const game = await Game.findOne({ _id: req.params.id, developer: req.session.user._id }).lean();
  if (!game) return res.status(404).send('Not found');
  res.render('dev-game-form', { game, error: null });
});
router.post('/:id/edit', requireDev, async (req, res) => {
  const b = req.body;
  await Game.updateOne({ _id: req.params.id, developer: req.session.user._id }, {
    title: b.title, tagline: b.tagline, description: b.description,
    genres: String(b.genres || '').split(',').map(s => s.trim()).filter(Boolean),
    tags: String(b.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    coverImage: b.coverImage, price: Number(b.price), discountPct: Number(b.discountPct || 0),
    'physical.enabled': b.physicalEnabled === 'on',
    'physical.price': Number(b.physicalPrice || 0),
    'physical.stock': Number(b.physicalStock || 0),
    status: b.status || 'published', featured: b.featured === 'on'
  });
  res.redirect('/dev');
});

// Payout request (resets balance)
router.post('/payout', requireDev, async (req, res) => {
  const me = await User.findById(req.session.user._id);
  if ((me.devProfile?.balanceOwed || 0) < 10) return res.status(400).send('Minimum $10 payout.');
  me.devProfile.balanceOwed = 0;
  me.wallet += 0;
  await me.save();
  res.redirect('/dev');
});

// Toy shelf: stock overview + restock
router.get('/toys', requireDev, async (req, res) => {
  const Toy = require('../models/Toy');
  const toys = await Toy.find({}).sort({ title: 1 }).lean();
  res.render('dev-toys', { toys, ok: req.query.ok || null });
});

router.post('/toys/:id/restock', requireDev, async (req, res) => {
  const Toy = require('../models/Toy');
  const qty = Math.max(0, Math.min(999, Number(req.body.stock ?? 0)));
  await Toy.updateOne({ _id: req.params.id }, { $set: { stock: qty } });
  res.redirect('/dev/toys?ok=restocked');
});

// Key vault: stock overview + bulk import / demo generate
router.get('/:id/keys', requireDev, async (req, res) => {
  const GameKey = require('../models/GameKey');
  const { encryptKey, hashKey } = require('../lib/keyCrypto');
  void encryptKey; void hashKey;
  const game = await Game.findOne({ _id: req.params.id, developer: req.session.user._id }).lean();
  if (!game) return res.status(404).send('Not found');
  const [available, sold, revoked] = await Promise.all([
    GameKey.countDocuments({ game: game._id, status: 'available' }),
    GameKey.countDocuments({ game: game._id, status: 'sold' }),
    GameKey.countDocuments({ game: game._id, status: 'revoked' }),
  ]);
  const recent = await GameKey.find({ game: game._id }).sort({ createdAt: -1 }).limit(20).lean();
  res.render('dev-keys', { game, available, sold, revoked, recent, error: null, ok: req.query.ok || null });
});

router.post('/:id/keys/import', requireDev, async (req, res) => {
  const GameKey = require('../models/GameKey');
  const { encryptKey, hashKey } = require('../lib/keyCrypto');
  const game = await Game.findOne({ _id: req.params.id, developer: req.session.user._id });
  if (!game) return res.status(404).send('Not found');
  // Accept textarea CSV: one key per line, or comma separated
  const raw = String(req.body.keys || '');
  const batchId = String(req.body.batchId || `manual-${Date.now().toString(36)}`).slice(0, 40);
  const platform = ['Steam', 'Epic', 'GOG', 'PixelVault'].includes(req.body.platform) ? req.body.platform : 'Steam';
  const parts = raw.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean).slice(0, 2000);
  if (!parts.length) {
    const recent = await GameKey.find({ game: game._id }).sort({ createdAt: -1 }).limit(20).lean();
    return res.render('dev-keys', { game: game.toObject(), available: 0, sold: 0, revoked: 0, recent, error: 'No keys found in input.', ok: null });
  }
  let added = 0;
  for (const plain of parts) {
    try {
      await GameKey.create({
        game: game._id, batchId, platform,
        codeEnc: encryptKey(plain), codeHash: hashKey(`${game._id}:${plain}`),
        status: 'available'
      });
      added++;
    } catch { /* duplicate — skip */ }
  }
  await Game.updateOne({ _id: game._id }, { $inc: { 'stats.keysAvailable': added } });
  res.redirect(`/dev/${game._id}/keys?ok=imported-${added}`);
});

router.post('/:id/keys/generate', requireDev, async (req, res) => {
  const GameKey = require('../models/GameKey');
  const { encryptKey, hashKey, makeDemoKey } = require('../lib/keyCrypto');
  const game = await Game.findOne({ _id: req.params.id, developer: req.session.user._id });
  if (!game) return res.status(404).send('Not found');
  const n = Math.min(500, Math.max(1, Number(req.body.count || 20)));
  const batchId = `demo-${Date.now().toString(36)}`;
  let added = 0;
  for (let i = 0; i < n; i++) {
    const plain = makeDemoKey('DEMO'); // DEMO-XXXXX-XXXXX-XXXXX — placeholder, not a real Steam key
    try {
      await GameKey.create({
        game: game._id, batchId, platform: 'Steam',
        codeEnc: encryptKey(plain), codeHash: hashKey(`${game._id}:${plain}`),
        status: 'available'
      });
      added++;
    } catch {}
  }
  await Game.updateOne({ _id: game._id }, { $inc: { 'stats.keysAvailable': added } });
  res.redirect(`/dev/${game._id}/keys?ok=generated-${added}`);
});

module.exports = router;
