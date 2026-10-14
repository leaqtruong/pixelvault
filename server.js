require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

/* Behind a proxy that terminates TLS — Render, or anything else fronting this
   with nginx — Express sees plain http unless told to trust the forwarded
   headers. That matters here beyond redirects: the payment gateway builds its
   return URL from req.protocol, so without this a live VNPay redirect comes
   back over http on an https site. */
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionOptions = {
  secret: process.env.SESSION_SECRET || 'pixelvault-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    // only over https, and only in production, so plain-http local use still
    // gets a working cookie
    secure: IS_PROD,
    sameSite: 'lax',
  },
};

/* Keep sessions in MongoDB rather than the process heap.
 *
 * MemoryStore loses every login the moment the process is replaced, which on a
 * platform that recycles instances happens automatically. The store is created
 * unconditionally: Mongoose buffers queries issued before the connection opens,
 * so there is nothing to wait for and nothing to swap in later.
 */
const { createMongoSessionStore } = require('./lib/mongoSessionStore');
app.use(session({ ...sessionOptions, store: createMongoSessionStore(mongoose.connection) }));

// JSON API for the React SPA
app.use('/api', require('./routes/api').router);

// Stand-in gateway. Mounted at the root because a real gateway is a different
// origin — keeping it off /api makes the redirect cross-app in the same shape.
app.use('/', require('./routes/sandboxGateway'));

// React SPA (built with `npm run build --prefix client`)
const dist = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, { maxAge: '7d', immutable: true }));
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
