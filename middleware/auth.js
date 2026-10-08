function currentUser(req, res, next) {
  res.locals.sessionUser = req.session.user || null;
  res.locals.isDev = req.session.user && (req.session.user.role === 'developer' || req.session.user.role === 'admin');
  next();
}

function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  }
  next();
}

function requireDev(req, res, next) {
  if (!req.session.user) return res.redirect('/auth/login');
  if (!['developer', 'admin'].includes(req.session.user.role)) {
    return res.status(403).send('Developer account required. <a href="/dev/apply">Become a developer</a>');
  }
  next();
}

function cart(req) {
  if (!req.session.cart) req.session.cart = [];
  return req.session.cart;
}

module.exports = { currentUser, requireLogin, requireDev, cart };
