import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api, waitForDb } from './api.js';
import { Layout, ToastHost } from './components.jsx';
import { BUILD } from './version.js';
import { Home, Store, GameDetail, Toys, ToyDetail } from './pages-shop.jsx';
import { Cart, Checkout, Orders, OrderDetail, Library, Recommendations } from './pages-trade.jsx';
import { Login, Register, Profile, DevApply, Dev, DevNew, DevKeys, DevToys, DevSales, Community, CommunityNew, PostDetail, Mods, ModDetail, Settings } from './pages-user.jsx';

export default function App() {
  const [me, setMe] = useState(null);
  const [dbUp, setDbUp] = useState(false);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('pv-theme') || 'dark'; } catch { return 'dark'; } });
  // Hold the UI until MongoDB answers, then retry silently in the background.
  useEffect(() => {
    let alive = true;
    waitForDb('/stats', 60, 1500)
      .then(() => { if (alive) { setDbUp(true); setReady(true); } })
      .catch(() => { if (alive) setReady(true); });
    const t = setInterval(() => { if (!alive) return; fetch('/api/stats', { cache: 'no-store' }).then((r) => r.ok && setDbUp(true)).catch(() => {}); }, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  useEffect(() => {
    if (!dbUp) return;
    api('/auth/me').then((d) => setMe(d.user)).catch(() => {}).finally(() => setReady(true));
  }, [dbUp]);
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
    <BrowserRouter>
      <div className="bg-fx" aria-hidden="true">
        <span className="shard" /><span className="shard" /><span className="shard" /><span className="shard" />
        <span className="shard" /><span className="shard" /><span className="shard" /><span className="shard" />
      </div>
      <Layout me={me} onLogout={() => setMe(null)} theme={theme} onTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>
        <ToastHost>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/games" element={<Store />} />
          <Route path="/games/:slug" element={<GameDetail me={me} />} />
          <Route path="/toys" element={<Toys />} />
          <Route path="/toys/:slug" element={<ToyDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={me ? <Checkout /> : <Navigate to="/login" />} />
          <Route path="/orders" element={me ? <Orders /> : <Navigate to="/login" />} />
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
          <Route path="/community" element={<Community />} />
          <Route path="/community/new" element={<CommunityNew />} />
          <Route path="/community/p/:id" element={<PostDetail />} />
          <Route path="/mods" element={<Mods />} />
          <Route path="/mods/:id" element={<ModDetail />} />
          <Route path="/settings" element={<Settings me={me} onMe={setMe} theme={theme} onTheme={(t) => setTheme(t)} />} />
          <Route path="*" element={<p className="muted">404 — vault corridor not found. <a href="/">Back home</a></p>} />
        </Routes>
        </ToastHost>
      </Layout>
    </BrowserRouter>
  );
}
