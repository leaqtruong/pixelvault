const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const router = express.Router();

router.get('/register', (req, res) => res.render('auth-form', { mode: 'register', error: null }));
router.get('/login', (req, res) => res.render('auth-form', { mode: 'login', error: null }));

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.render('auth-form', { mode: 'register', error: 'All fields required.' });
    const exists = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
    if (exists) return res.render('auth-form', { mode: 'register', error: 'Username or email taken.' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email: email.toLowerCase(), passwordHash });
    req.session.user = { _id: user._id, username: user.username, role: user.role, email: user.email };
    res.redirect(req.session.returnTo || '/');
  } catch (e) { res.render('auth-form', { mode: 'register', error: e.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) return res.render('auth-form', { mode: 'login', error: 'Invalid credentials.' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.render('auth-form', { mode: 'login', error: 'Invalid credentials.' });
    req.session.user = { _id: user._id, username: user.username, role: user.role, email: user.email };
    res.redirect(req.session.returnTo || '/');
  } catch (e) { res.render('auth-form', { mode: 'login', error: e.message }); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
