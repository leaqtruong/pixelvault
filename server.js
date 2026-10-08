require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const methodOverride = require('method-override');
const connectDB = require('./config/db');
const { currentUser } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'pixelvault-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(currentUser);

// Home
app.get('/', async (req, res) => {
  try {
    const Game = require('./models/Game');
    const Post = require('./models/Post');
    const featured = await Game.find({ status: 'published', featured: true }).limit(5).lean();
    const deals = await Game.find({ status: 'published', discountPct: { $gt: 0 } }).sort({ discountPct: -1 }).limit(8).lean();
    const fresh = await Game.find({ status: 'published' }).sort({ releaseDate: -1 }).limit(8).lean();
    const threads = await Post.find().sort({ createdAt: -1 }).limit(5).populate('author', 'username').lean();
    // Category tiles use real game capsules from the catalog (not generic stock photos)
    const catNames = ['Action', 'RPG', 'Strategy', 'Indie', 'Adventure', 'Simulation', 'Horror', 'Free to Play'];
    const catTiles = [];
    for (const c of catNames) {
      const g = await Game.findOne({ status: 'published', genres: c }).lean();
      if (g) catTiles.push({ name: c, img: g.coverImage, slug: g.slug });
    }
    // fallback demo data when DB empty / offline
    const demo = featured.length === 0 && deals.length === 0;
    const Toy = require('./models/Toy');
    const toys = await Toy.find({ status: 'published' }).limit(4).lean();
    res.render('index', { featured, deals, fresh, threads, demo, catTiles, toys });
  } catch (e) {
    res.render('index', { featured: [], deals: [], fresh: [], threads: [], demo: true, catTiles: [], toys: [] });
  }
});

app.use('/auth', require('./routes/auth'));
app.use('/games', require('./routes/games'));
app.use('/toys', require('./routes/toys'));
app.use('/cart', require('./routes/cart'));
app.use('/', require('./routes/checkout')); // exposes /checkout, /orders
app.use('/library', require('./routes/library'));
app.use('/dev', require('./routes/dev'));
app.use('/mods', require('./routes/mods'));
app.use('/community', require('./routes/community'));
app.use('/reviews', require('./routes/reviews'));
app.use('/users', require('./routes/users'));

// Health + tiny JSON API (used by frontend widgets)
app.get('/api/stats', async (req, res) => {
  try {
    const Game = require('./models/Game');
    const Order = require('./models/Order');
    const [games, orders] = await Promise.all([Game.countDocuments({ status: 'published' }), Order.countDocuments()]);
    res.json({ games, orders, ok: true });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.use((req, res) => res.status(404).send(`<h1>404 — vault corridor not found</h1><p><a href="/">Back home</a></p>`));

app.listen(PORT, () => console.log(`[pixelvault] http://localhost:${PORT}`));
connectDB(process.env.MONGO_URI);
