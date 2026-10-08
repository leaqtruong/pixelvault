import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api.js';
import { Layout } from './components.jsx';
import { Home, Store, GameDetail, Toys, ToyDetail } from './pages-shop.jsx';
import { Cart, Checkout, Orders, OrderDetail, Library, Recommendations } from './pages-trade.jsx';
import { Login, Register, Profile, DevApply, Dev, DevNew, DevKeys, DevToys, Community, CommunityNew, PostDetail, Mods, ModDetail, Settings } from './pages-user.jsx';

export default function App() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('pv-theme') || 'dark'; } catch { return 'dark'; } });
  useEffect(() => { api('/auth/me').then((d) => setMe(d.user)).catch(() => {}).finally(() => setReady(true)); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('pv-theme', theme); } catch {}
  }, [theme]);
  if (!ready) return <p className="muted" style={{ padding: 40 }}>Loading PixelVault…</p>;
  return (
    <BrowserRouter>
      <Layout me={me} onLogout={() => setMe(null)} theme={theme} onTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>
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
          <Route path="/community" element={<Community />} />
          <Route path="/community/new" element={<CommunityNew />} />
          <Route path="/community/p/:id" element={<PostDetail />} />
          <Route path="/mods" element={<Mods />} />
          <Route path="/mods/:id" element={<ModDetail />} />
          <Route path="/settings" element={<Settings me={me} onMe={setMe} theme={theme} onTheme={(t) => setTheme(t)} />} />
          <Route path="*" element={<p className="muted">404 — vault corridor not found. <a href="/">Back home</a></p>} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
