import { useEffect, useState, Component, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api, waitForDb } from './api.js';
import { Layout, ToastHost } from './components.jsx';
import { BUILD } from './version.js';

// Route-level code splitting: each page family is its own chunk, loaded the
// first time a route inside it is visited instead of at boot.
const laz = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const shop = () => import('./pages-shop.jsx');
const trade = () => import('./pages-trade.jsx');
const users = () => import('./pages-user.jsx');
const admin = () => import('./admin/Admin.jsx');
const Home = laz(shop, 'Home');
const Store = laz(shop, 'Store');
const GameDetail = laz(shop, 'GameDetail');
const Toys = laz(shop, 'Toys');
const ToyDetail = laz(shop, 'ToyDetail');
const Cart = laz(trade, 'Cart');
const Checkout = laz(trade, 'Checkout');
const Orders = laz(trade, 'Orders');
const OrderDetail = laz(trade, 'OrderDetail');
const Library = laz(trade, 'Library');
const Recommendations = laz(trade, 'Recommendations');
const PaymentReturn = laz(trade, 'PaymentReturn');
const Login = laz(users, 'Login');
const Register = laz(users, 'Register');
const Profile = laz(users, 'Profile');
const DevApply = laz(users, 'DevApply');
const Dev = laz(users, 'Dev');
const DevNew = laz(users, 'DevNew');
const DevKeys = laz(users, 'DevKeys');
const DevToys = laz(users, 'DevToys');
const DevSales = laz(users, 'DevSales');
const Community = laz(users, 'Community');
const CommunityNew = laz(users, 'CommunityNew');
const PostDetail = laz(users, 'PostDetail');
const Settings = laz(users, 'Settings');
const Support = laz(users, 'Support');
const Admin = laz(admin, 'Admin');

/* A single missing or unexpected field used to unmount the whole tree and
   leave a black page with no clue why. Catch it here and say what happened. */
class CrashBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('page crashed:', err, info?.componentStack); }
  render() {
    if (this.state.err) {
      return (
        <div className="boot">
          <p className="logo">PIXEL<span>VAULT</span></p>
          <p className="tiny">This page hit an unexpected value and stopped rendering.</p>
          <pre className="mono tiny" style={{ maxWidth: 720, whiteSpace: 'pre-wrap', textAlign: 'left' }}>
            {String(this.state.err && this.state.err.message || this.state.err)}
          </pre>
          <a className="cta-btn sm" href="/">Back to the store</a>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [me, setMe] = useState(null);
  const [dbUp, setDbUp] = useState(false);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('pv-theme') || 'dark'; } catch { return 'dark'; } });
  // Keep probing MongoDB in the background; the boot gate below belongs to the
  // session check, not to this poll.
  useEffect(() => {
    let alive = true;
    waitForDb('/stats', 60, 1500)
      .then(() => { if (alive) setDbUp(true); })
      .catch(() => {});
    const t = setInterval(() => { if (!alive) return; fetch('/api/stats', { cache: 'no-store' }).then((r) => r.ok && setDbUp(true)).catch(() => {}); }, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  /* The route guards test `me`, so the UI must stay on the boot screen until
     /auth/me has answered. Two independent effects used to call setReady: this
     one and the database poll above. When the poll won the race, a protected
     route rendered with me still null and redirected a signed-in visitor to
     /login — visible as a login form under a header that already says Log out.
     Readiness therefore has exactly one owner: the session check. */
  useEffect(() => {
    api('/auth/me').then((d) => setMe(d.user)).catch(() => {}).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('pv-theme', theme); } catch {}
  }, [theme]);

  // Self-healing build check: if the bundle on disk moved on, take the tab with it.
  // sessionStorage guard prevents a reload loop if the stamp ever disagrees twice.
  useEffect(() => {
    const check = () => {
      fetch('/api/version', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (!d || !d.build || d.build === BUILD) { try { sessionStorage.removeItem('pv-reloaded'); } catch {} return; }
          let seen = null;
          try { seen = sessionStorage.getItem('pv-reloaded'); } catch {}
          if (seen === d.build) return;              // already reloaded onto this stamp
          try { sessionStorage.setItem('pv-reloaded', d.build); } catch {}
          window.location.reload();
        })
        .catch(() => {});
    };
    const t = setInterval(check, 20000);
    check();
    return () => clearInterval(t);
  }, []);

  if (!ready) return (
    <div className="boot">
      <p className="logo">PIXEL<span>VAULT</span></p>
      <p className="tiny">Connecting to MongoDB — this takes a second on a cold start.</p>
    </div>
  );
  return (
    <CrashBoundary>
    <BrowserRouter>
      <div className="bg-fx" aria-hidden="true">
        <span className="shard" /><span className="shard" /><span className="shard" /><span className="shard" />
        <span className="shard" /><span className="shard" /><span className="shard" /><span className="shard" />
      </div>
      <Layout me={me} onLogout={() => setMe(null)} theme={theme} onTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>
        <ToastHost>
        <Suspense fallback={<div className="boot"><p className="tiny">Loading…</p></div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/games" element={<Store />} />
          <Route path="/games/:slug" element={<GameDetail me={me} />} />
          <Route path="/toys" element={<Toys />} />
          <Route path="/toys/:slug" element={<ToyDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={me ? <Checkout /> : <Navigate to="/login" />} />
          <Route path="/orders" element={me ? <Orders /> : <Navigate to="/login" />} />
          <Route path="/payment/return" element={<PaymentReturn />} />
          <Route path="/orders/:id" element={me ? <OrderDetail /> : <Navigate to="/login" />} />
          <Route path="/library" element={me ? <Library /> : <Navigate to="/login" />} />
          <Route path="/recommendations" element={me ? <Recommendations /> : <Navigate to="/login" />} />
          <Route path="/login" element={<Login onLogin={setMe} />} />
          <Route path="/register" element={<Register onLogin={setMe} />} />
          <Route path="/users/:username" element={<Profile me={me} />} />
          <Route path="/dev" element={<Dev />} />
          <Route path="/dev/apply" element={<DevApply />} />
          <Route path="/dev/new" element={<DevNew />} />
          <Route path="/dev/keys/:id" element={<DevKeys />} />
          <Route path="/dev/toys" element={<DevToys />} />
          <Route path="/dev/sales" element={<DevSales />} />
          <Route path="/admin" element={me ? <Admin /> : <Navigate to="/login" />} />
          <Route path="/community" element={<Community />} />
          <Route path="/community/new" element={<CommunityNew />} />
          <Route path="/community/p/:id" element={<PostDetail />} />
          <Route path="/settings" element={<Settings me={me} onMe={setMe} theme={theme} onTheme={(t) => setTheme(t)} />} />
          <Route path="/support" element={<Support />} />
          <Route path="*" element={<p className="muted">404 — vault corridor not found. <a href="/">Back home</a></p>} />
        </Routes>
        </Suspense>
        </ToastHost>
      </Layout>
    </BrowserRouter>
    </CrashBoundary>
  );
}
