require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieSession = require('cookie-session');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

/* Behind a proxy that terminates TLS — Render, or anything else fronting this
   with nginx — Express sees plain http unless told to trust the forwarded
   headers. That matters here beyond redirects: the payment gateway builds its
   return URL from req.protocol, so without this a live VNPay redirect comes
   back over http on an https site. */
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* Basic hardening: don't advertise the stack, and pin the headers a browser
   cache- or clickjacking attack would otherwise rely on. A full CSP is omitted
   on purpose — the SPA inlines React style props and loads the Google Sign-In
   script and Steam art from their CDNs, so a strict policy would break it. */
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

/* The session itself lives in a signed, HttpOnly cookie on the user's machine.
   Nothing is kept in process memory or in MongoDB, so a restart does not sign
   anyone out, and there is no sessions collection to grow or clean up. The
   cookie is signed with SESSION_SECRET: the browser can read its own payload
   but cannot change it without invalidating the signature. */
const sessionOptions = {
  name: 'pv.sid',
  keys: [process.env.SESSION_SECRET || 'pixelvault-dev-secret'],
  maxAge: 1000 * 60 * 60 * 24 * 7,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.RENDER === 'true',
};

/* Sessions live in a signed cookie on the client. There is no server-side
   store to configure and no session row in MongoDB. */
app.use(cookieSession(sessionOptions));

// JSON API for the React SPA
app.use('/api', require('./routes/api').router);

// Stand-in gateway. Mounted at the root because a real gateway is a different
// origin — keeping it off /api makes the redirect cross-app in the same shape.
// It is mounted only when no merchant account is configured: a simulator that
// shares this process while VNP_* is live would be a signing oracle for real
// callbacks, and the two secrets are deliberately different.
if (!require('./lib/paymentGateway').isConfigured()) {
  app.use('/', require('./routes/sandboxGateway'));
}

// React SPA (built with `npm run build --prefix client`)
const dist = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, {
    maxAge: '7d',
    immutable: true,
    // index.html is the only file that NAMES the content-hashed bundles.
    // Caching it makes the client keep requesting bundle filenames the next
    // build deleted, which 404s and leaves a blank page - and "immutable"
    // stops the browser from ever revalidating, so it never recovers.
    // Hashed assets keep their long cache: their name changes with content.
    setHeaders(res, filePath) {
      if (path.basename(filePath) === 'index.html') {
        res.setHeader('Cache-Control', 'no-store');
      }
    },
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    // Never cache the shell: clients always boot the newest bundle.
    res.sendFile(path.join(dist, 'index.html'), { headers: { 'Cache-Control': 'no-store' } });
  });
} else {
  app.get('/', (req, res) => res.send('<h1>PixelVault API</h1><p>Build the React client: <code>npm run build --prefix client</code></p>'));
}

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => console.log(`[pixelvault] http://localhost:${PORT}`));
connectDB(process.env.MONGO_URI);
