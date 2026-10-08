const express = require('express');
const Game = require('../models/Game');
const Order = require('../models/Order');
const User = require('../models/User');
const { requireLogin, cart } = require('../middleware/auth');
const router = express.Router();

const TAX_RATE = Number(process.env.TAX_RATE || 0.08);
const DEV_CUT = Number(process.env.DEV_REVENUE_CUT || 0.7);

function shippingQuote(items, method) {
  const weight = items.reduce((s, i) => s + (i.weightLb || 0) * i.qty, 0);
  const hasPhysical = items.some(i => i.edition === 'physical');
  if (!hasPhysical) return { cost: 0, weight };
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  let cost = 0;
  if (method === 'standard') cost = subtotal > 75 ? 0 : 4.99 + weight * 0.5;
  if (method === 'express') cost = 14.99 + weight * 1.2;
  if (method === 'overnight') cost = 29.99 + weight * 1.8;
  return { cost: +cost.toFixed(2), weight: +weight.toFixed(2) };
}

router.get('/checkout', requireLogin, async (req, res) => {
  const items = cart(req);
  if (!items.length) return res.redirect('/games');
  const user = await User.findById(req.session.user._id).lean();
  const method = req.query.method || 'standard';
  const { cost, weight } = shippingQuote(items, method);
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  res.render('checkout', { items, subtotal, tax, shipCost: cost, weight, grand: +(subtotal + tax + cost).toFixed(2), method, user });
});

router.get('/checkout/quote', (req, res) => {
  res.json(shippingQuote(cart(req), req.query.method || 'standard'));
});

router.post('/checkout/place', requireLogin, async (req, res) => {
  const items = cart(req);
  if (!items.length) return res.redirect('/games');
  const { method = 'standard', fullName, street, city, region, postal, country = 'US', phone, cardLast4 = '4242' } = req.body;
  const hasPhysical = items.some(i => i.edition === 'physical');
  if (hasPhysical && (!fullName || !street || !city || !postal)) {
    return res.status(400).send('Shipping address incomplete. <a href="/checkout">Back</a>');
  }

  const subtotal = +items.reduce((s, i) => s + i.unitPrice * i.qty, 0).toFixed(2);
  const { cost: shipCost } = shippingQuote(items, method);
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const grandTotal = +(subtotal + tax + shipCost).toFixed(2);

  const GameKey = require('../models/GameKey');
  const Toy = require('../models/Toy');
  const orderItems = [];
  const devPayouts = [];
  const claimedKeyIds = [];
  const decrementedPhysical = []; // for rollback { gameId, qty }
  const decrementedToys = []; // for rollback { toyId, qty }
  try {
    for (const i of items) {
      const kind = i.kind || 'game';
      if (kind === 'toy') {
        // Standalone collectible: atomic stock decrement on toys collection.
        const t = await Toy.findOneAndUpdate(
          { _id: i.toyId, stock: { $gte: i.qty } },
          { $inc: { stock: -i.qty, 'stats.unitsSold': i.qty } },
          { new: true }
        );
        if (!t) throw new Error(`${i.title} is out of stock (someone just bought the last one).`);
        decrementedToys.push({ toyId: t._id, qty: i.qty });
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
        // Atomic stock decrement — prevents oversell when 2 buyers race.
        const updated = await Game.findOneAndUpdate(
          { _id: g._id, 'physical.stock': { $gte: i.qty } },
          { $inc: { 'physical.stock': -i.qty, 'stats.unitsPhysical': i.qty } },
          { new: true }
        );
        if (!updated) {
          throw new Error(`${g.title} physical stock insufficient (someone just bought the last box).`);
        }
        decrementedPhysical.push({ gameId: g._id, qty: i.qty });
      } else {
        // Free games need no key; paid digital games claim N keys atomically.
        if (i.unitPrice > 0) {
          for (let k = 0; k < i.qty; k++) {
            const claimed = await GameKey.claimOne(g._id, { userId: req.session.user._id });
            if (!claimed) {
              throw new Error(`${g.title} is out of digital keys — ${k}/${i.qty} claimed. Try again or contact support.`);
            }
            claimedKeyIds.push(claimed._id);
            keyIds.push(claimed._id);
          }
          await Game.updateOne({ _id: g._id }, {
            $inc: { 'stats.unitsDigital': i.qty, 'stats.keysSold': i.qty, 'stats.keysAvailable': -keyIds.length }
          });
        } else {
          await Game.updateOne({ _id: g._id }, { $inc: { 'stats.unitsDigital': i.qty } });
        }
      }
      const gross = +(i.unitPrice * i.qty).toFixed(2);
      const fresh = await Game.findById(g._id);
      if (fresh && i.edition !== 'physical') {
        fresh.stats.revenueGross = +((fresh.stats.revenueGross || 0) + gross).toFixed(2);
        await fresh.save();
      } else if (fresh) {
        fresh.stats.revenueGross = +((fresh.stats.revenueGross || 0) + gross).toFixed(2);
        await fresh.save();
      }
      orderItems.push({ kind: 'game', game: g._id, title: g.title, edition: i.edition, unitPrice: i.unitPrice, qty: i.qty, weightLb: i.weightLb || 0, keyIds });
      devPayouts.push({ developer: g.developer, game: g._id, gross, cut: +(gross * DEV_CUT).toFixed(2) });

      // credit developer balance
      await User.updateOne({ _id: g.developer }, { $inc: { 'devProfile.balanceOwed': +(gross * DEV_CUT).toFixed(2) } });
    }
  } catch (e) {
    // Rollback: release claimed keys + restore physical/toy stock
    if (claimedKeyIds.length) {
      await GameKey.updateMany({ _id: { $in: claimedKeyIds } }, { $set: { status: 'available', order: null, user: null, soldAt: null } });
    }
    for (const r of decrementedPhysical) {
      await Game.updateOne({ _id: r.gameId }, { $inc: { 'physical.stock': r.qty, 'stats.unitsPhysical': -r.qty } });
    }
    for (const r of decrementedToys) {
      await Toy.updateOne({ _id: r.toyId }, { $inc: { stock: r.qty, 'stats.unitsSold': -r.qty } });
    }
    return res.status(400).send(`${e.message} <a href="/cart">Back to cart</a>`);
  }

  const tracking = hasPhysical ? 'PV-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100) : undefined;
  const order = await Order.create({
    user: req.session.user._id,
    items: orderItems,
    subtotal, discountTotal: 0, tax, shippingTotal: shipCost, grandTotal,
    payment: { method: 'card', last4: String(cardLast4).slice(-4) },
    shipment: hasPhysical ? {
      tracking, method, cost: shipCost,
      address: { fullName, street, city, region, postal, country, phone },
      status: 'packing'
    } : undefined,
    devPayouts
  });

  // grant library entries + purchase history + save address
  const user = await User.findById(req.session.user._id);
  for (const oi of orderItems) {
    if (oi.kind === 'toy') {
      const has = (user.toyLibrary || []).some((e) => String(e.toy) === String(oi.toy));
      if (has) {
        const entry = user.toyLibrary.find((e) => String(e.toy) === String(oi.toy));
        entry.qty += oi.qty;
      } else user.toyLibrary.push({ toy: oi.toy, qty: oi.qty });
    } else if (!user.ownsGame(oi.game)) user.library.push({ game: oi.game, edition: oi.edition });
  }
  user.purchaseHistory.push(order._id);
  if (hasPhysical) {
    const exists = user.addresses.some(a => a.street === street && a.postal === postal);
    if (!exists) user.addresses.push({ label: 'Checkout', fullName, street, city, region, postal, country, phone });
  }
  await user.save();

  // Link claimed keys to final order (atomic claim happened before order id existed)
  if (claimedKeyIds.length) {
    await GameKey.updateMany({ _id: { $in: claimedKeyIds } }, { $set: { order: order._id } });
  }

  req.session.cart = [];
  res.redirect(`/orders/${order._id}`);
});

// Order detail + tracking (with decrypted demo keys for owner)
router.get('/orders/:id', requireLogin, async (req, res) => {
  const order = await Order.findById(req.params.id).populate('items.game').populate('items.toy').populate('items.keyIds').lean();
  if (!order) return res.status(404).send('Order not found');
  if (String(order.user) !== String(req.session.user._id) && req.session.user.role !== 'admin') return res.status(403).send('Forbidden');
  // Decrypt keys for display (owner only). Fail-soft when KEY_ENCRYPTION_SECRET rotated.
  let plainById = {};
  try {
    const { decryptKey } = require('../lib/keyCrypto');
    (order.items || []).forEach(it => (it.keyIds || []).forEach(k => {
      try { plainById[String(k._id)] = decryptKey(k.codeEnc); } catch { plainById[String(k._id)] = '(undecryptable — secret rotated)'; }
    }));
  } catch {}
  res.render('order-detail', { order, plainById });
});

router.get('/orders', requireLogin, async (req, res) => {
  const orders = await Order.find({ user: req.session.user._id }).sort({ createdAt: -1 }).lean();
  res.render('orders', { orders });
});

// Simulate shipment progress (demo carrier webhook)
router.post('/orders/:id/advance', requireLogin, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || !order.shipment) return res.status(400).send('No shipment');
  const flow = ['packing', 'shipped', 'in_transit', 'out_for_delivery', 'delivered'];
  const idx = flow.indexOf(order.shipment.status);
  if (idx < flow.length - 1) {
    order.shipment.status = flow[idx + 1];
    if (order.shipment.status === 'shipped') { order.shipment.shippedAt = new Date(); order.status = 'shipped'; }
    if (order.shipment.status === 'delivered') { order.shipment.deliveredAt = new Date(); order.status = 'delivered'; }
    await order.save();
  }
  res.redirect(`/orders/${order._id}`);
});

module.exports = router;
