const express = require('express');
const Game = require('../models/Game');
const Toy = require('../models/Toy');
const { cart } = require('../middleware/auth');
const router = express.Router();

function totals(items) {
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  return { subtotal };
}

async function lookup(kind, id) {
  if (kind === 'toy') return { doc: await Toy.findById(id).lean(), isToy: true };
  return { doc: await Game.findById(id).lean(), isToy: false };
}

router.get('/', async (req, res) => {
  const items = cart(req);
  // refresh prices
  for (const i of items) {
    const kind = i.kind || 'game';
    const { doc, isToy } = await lookup(kind, kind === 'toy' ? i.toyId : i.gameId);
    if (!doc) continue;
    if (isToy) {
      i.title = doc.title;
      i.coverImage = doc.coverImage;
      i.unitPrice = doc.price;
      i.weightLb = doc.weightLb || 1.0;
      i.stock = doc.stock;
    } else {
      const g = doc;
      i.title = g.title;
      i.coverImage = g.coverImage;
      i.unitPrice = i.edition === 'physical' ? (g.physical.price || g.price + 15) : +(g.price * (1 - g.discountPct / 100)).toFixed(2);
      i.weightLb = i.edition === 'physical' ? (g.physical.weightLb || 0.5) : 0;
      i.stock = g.physical.stock;
    }
  }
  const { subtotal } = totals(items);
  res.render('cart', { items, subtotal });
});

router.post('/add', async (req, res) => {
  const { gameId, toyId, edition = 'digital', qty = 1 } = req.body;
  const items = cart(req);
  if (toyId) {
    const t = await Toy.findById(toyId);
    if (!t || t.status !== 'published') return res.status(404).send('Collectible not found');
    if ((t.stock || 0) < Number(qty)) {
      return res.status(400).send(`Only ${t.stock} left in stock. <a href="/toys/${t.slug}">Back</a>`);
    }
    const key = `toy:${toyId}`;
    const found = items.find((i) => i.key === key);
    if (found) found.qty = Math.min(9, found.qty + Number(qty));
    else items.push({ key, kind: 'toy', toyId: String(t._id), title: t.title, coverImage: t.coverImage, edition: 'physical', qty: Number(qty), unitPrice: t.price, weightLb: t.weightLb || 1.0 });
    return res.redirect('/cart');
  }
  const g = await Game.findById(gameId);
  if (!g) return res.status(404).send('Game not found');
  if (edition === 'physical' && (!g.physical.enabled || g.physical.stock < Number(qty))) {
    return res.status(400).send('Physical edition out of stock. <a href="back">Go back</a>');
  }
  if (edition !== 'physical' && (g.price || 0) > 0) {
    const GameKey = require('../models/GameKey');
    const avail = await GameKey.countAvailable(g._id);
    if (avail < Number(qty)) {
      return res.status(400).send(`Out of digital keys (${avail} left). Devs restock in Dev console → Keys. <a href="/games/${g.slug}">Back</a>`);
    }
    if (Number(qty) > avail) return res.status(400).send('Not enough keys. <a href="back">Go back</a>');
  }
  const key = `game:${gameId}:${edition}`;
  const found = items.find((i) => i.key === key);
  const unitPrice = edition === 'physical' ? (g.physical.price || g.price + 15) : +(g.price * (1 - g.discountPct / 100)).toFixed(2);
  if (found) found.qty = Math.min(9, found.qty + Number(qty));
  else items.push({ key, kind: 'game', gameId: String(g._id), title: g.title, coverImage: g.coverImage, edition, qty: Number(qty), unitPrice, weightLb: edition === 'physical' ? g.physical.weightLb || 0.5 : 0 });
  res.redirect('/cart');
});

router.post('/remove', (req, res) => {
  req.session.cart = cart(req).filter((i) => i.key !== req.body.key);
  res.redirect('/cart');
});

router.post('/qty', (req, res) => {
  const item = cart(req).find((i) => i.key === req.body.key);
  if (item) item.qty = Math.max(1, Math.min(9, Number(req.body.qty)));
  res.redirect('/cart');
});

module.exports = router;
