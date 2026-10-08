const express = require('express');
const User = require('../models/User');
const Order = require('../models/Order');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

router.get('/:username', async (req, res) => {
  const user = await User.findOne({ username: req.params.username })
    .populate('library.game', 'title coverImage slug genres')
    .populate('wishlist', 'title coverImage slug price discountPct')
    .lean();
  if (!user) return res.status(404).send('User not found');
  const orders = await Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(10).lean();
  const isSelf = req.session.user && String(req.session.user._id) === String(user._id);
  res.render('profile', { user, orders, isSelf });
});

router.post('/me', requireLogin, async (req, res) => {
  await User.updateOne({ _id: req.session.user._id }, { bio: req.body.bio?.slice(0, 500), avatar: req.body.avatar });
  res.redirect(`/users/${req.session.user.username}`);
});

module.exports = router;
