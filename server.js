require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const connectDB = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'pixelvault-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

// JSON API for the React SPA
app.use('/api', require('./routes/api'));

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
