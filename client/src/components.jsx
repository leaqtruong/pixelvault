import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, priceOf } from './api.js';

const IcoSun = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>);
const IcoMoon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5z" /></svg>);
const IcoSliders = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" /></svg>);
const IcoTag = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h7l9 9-7 7-9-9z" /><circle cx="9" cy="9" r="1.6" /></svg>);

function Sidebar({ me, onLogout, theme, onTheme, onHide }) {
  const nav = useNavigate();
  const [mature, setMature] = useState(null);
  useEffect(() => {
    if (me) api('/users/' + me.username).then((d) => setMature(!!d.user?.preferences?.matureFilter)).catch(() => {});
  }, [me]);
  const flipMature = async () => {
    try {
      await api('/users/me', { method: 'POST', body: { matureFilter: !mature } });
      setMature(!mature);
    } catch {}
  };
  return (
    <aside className="side-rail" aria-label="Settings and account">
      <button className="ghost-btn sm" onClick={onHide}>Hide panel</button>
      <div className="rail-card">
        {me ? (
          <>
            <div className="rail-user">
              <span className="avatar-chip lg">{(me.username || '?')[0].toUpperCase()}</span>
              <div><b>{me.username}</b><br /><span className="tiny">{me.role}</span></div>
            </div>
            <div className="rail-links">
              <Link to="/library">My Library</Link>
              <Link to="/orders">Orders</Link>
              <Link to={`/users/${me.username}`}>Profile</Link>
            </div>
            <button className="ghost-btn sm" onClick={async () => { await api('/auth/logout', { method: 'POST' }); onLogout(); nav('/'); }}>Logout</button>
          </>
        ) : (
          <>
            <b>Welcome, guest</b>
            <p className="tiny">Login to buy keys, track orders and filter content.</p>
            <div className="row">
              <Link className="ghost-btn sm" to="/login">Login</Link>
              <Link className="cta-btn sm" to="/register">Join free</Link>
            </div>
          </>
        )}
      </div>
      <div className="rail-card">
        <h3>Appearance</h3>
        <div className="row">
          <button className={'ghost-btn sm' + (theme === 'dark' ? ' current' : '')} onClick={() => onTheme('dark')}>Dark</button>
          <button className={'ghost-btn sm' + (theme === 'light' ? ' current' : '')} onClick={() => onTheme('light')}>Light</button>
        </div>
      </div>
      {me && (
        <div className="rail-card">
          <h3>Content</h3>
          <button className={'ghost-btn sm' + (mature ? ' current' : '')} onClick={flipMature}>{mature ? 'Mature hidden' : 'Show mature'}</button>
        </div>
      )}
      <div className="rail-card">
        <h3>Vault</h3>
        <div className="rail-links">
          <Link to="/settings">All settings</Link>
          <Link to="/recommendations">For you</Link>
          <Link to="/community">Forums</Link>
        </div>
      </div>
    </aside>
  );
}

export function Layout({ me, onLogout, theme, onTheme, children }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [cartN, setCartN] = useState(0);
  useEffect(() => {
    api('/cart').then((d) => setCartN((d.items || []).reduce((s, i) => s + i.qty, 0))).catch(() => {});
  }, [loc.pathname]);
  const linkCls = (to) => (loc.pathname === to ? 'active' : '');
  const [menu, setMenu] = useState(false);
  const [hideSide, setHideSide] = useState(() => { try { return localStorage.getItem('pv-side') === 'hide'; } catch { return false; } });
  useEffect(() => { setMenu(false); }, [loc.pathname]);
  useEffect(() => { try { localStorage.setItem('pv-side', hideSide ? 'hide' : 'show'); } catch {} }, [hideSide]);
  return (
    <>
      <header className="topbar">
        <div className="topbar_inner">
          <button className="menu-btn" aria-label="Menu" onClick={() => setMenu(!menu)}>☰</button>
          <Link className="logo" to="/">PIXEL<span>VAULT</span></Link>
          <nav>
            <Link className={linkCls('/games')} to="/games">Store</Link>
            <Link className={linkCls('/toys')} to="/toys">Toys</Link>
            <Link className={linkCls('/community')} to="/community">Community</Link>
            <Link className={linkCls('/mods')} to="/mods">Mods</Link>
            <Link className={linkCls('/dev')} to="/dev">Dev Portal</Link>
          </nav>
          <div className="top-actions">
            <Link className="action-btn" to="/cart">Cart{cartN > 0 && <span className="cart-badge">{cartN}</span>}</Link>
            <button className="icon-btn" title={theme === 'light' ? 'Switch to dark' : 'Switch to light'} onClick={onTheme}>{theme === 'light' ? <IcoMoon /> : <IcoSun />}</button>
            {me ? (
              <>
                <Link className="avatar-chip" to={`/users/${me.username}`}>{(me.username || '?')[0].toUpperCase()}</Link>
                <button className="ghost-btn sm" onClick={async () => { await api('/auth/logout', { method: 'POST' }); onLogout(); nav('/'); }}>Logout</button>
              </>
            ) : (
              <>
                <Link className="ghost-btn sm" to="/login">Login</Link>
                <Link className="install-btn" to="/register">Join free</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <div className={'shell' + (menu ? ' menu-open' : '') + (hideSide ? ' no-side' : '')}>
        {menu && <div className="scrim" onClick={() => setMenu(false)} />}
        {hideSide && <button className="side-tab" onClick={() => setHideSide(false)}>PANEL</button>}
        {!hideSide && <Sidebar me={me} onLogout={onLogout} theme={theme} onTheme={onTheme} onHide={() => setHideSide(true)} />}
        <div className="shell-main">
          <div className="store_nav"><div className="store_nav_inner">
        <div className="drop"><button>Your Store</button><div className="drop_menu">
          <Link to="/">Home</Link><Link to="/recommendations">Recommendations</Link><Link to="/library">Your Library</Link><Link to="/games?sort=newest">Recently Released</Link>
        </div></div>
        <div className="drop"><button>New &amp; Noteworthy</button><div className="drop_menu">
          <Link to="/games?sort=popular">Top Sellers</Link><Link to="/games?sort=newest">New &amp; Trending</Link><Link to="/games?sort=rating">Top Rated</Link><Link to="/games?onSale=1">Special Offers</Link>
        </div></div>
        <div className="drop"><button>Categories</button><div className="drop_menu">
          {['Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Horror', 'Indie', 'Free to Play'].map((g) => <Link key={g} to={`/games?genre=${encodeURIComponent(g)}`}>{g}</Link>)}
        </div></div>
        <div className="drop"><button>Platforms</button><div className="drop_menu">
          {['Windows', 'Mac', 'Linux', 'Steam Deck', 'VR'].map((p) => <Link key={p} to={`/games?platform=${encodeURIComponent(p)}`}>{p}</Link>)}
        </div></div>
        <div className="drop"><button>Toys &amp; Merch</button><div className="drop_menu">
          <Link to="/toys">All Collectibles</Link><Link to="/toys?category=Plush">Plushies</Link><Link to="/toys?category=Figure">Figures</Link><Link to="/toys?category=Pins">Pins</Link>
        </div></div>
        <Link to="/community">Forums</Link>
        <Link to="/mods">Workshop</Link>
        <form className="store_search" onSubmit={(e) => { e.preventDefault(); nav('/games?q=' + encodeURIComponent(e.target.q.value)); }}>
          <input name="q" placeholder="search" /><button>Go</button>
        </form>
      </div></div>
      <main className="wrap page-enter" key={loc.pathname + loc.search}>{children}</main>
      <footer className="footer">PixelVault demo storefront — coursework project. Game data via Steam Store API, merch via official stores. Keys are DEMO placeholders.</footer>
        </div>
      </div>
    </>
  );
}

export function Price({ g }) {
  if ((g.price || 0) <= 0) return <div className="price_row"><span className="free_tag">Free To Play</span></div>;
  if (g.discountPct > 0) return (
    <div className="price_row"><div className="discount_block">
      <div className="discount_pct">-{g.discountPct}%</div>
      <div className="discount_prices"><div className="discount_original_price">${g.price.toFixed(2)}</div><div className="discount_final_price">${priceOf(g).toFixed(2)}</div></div>
    </div></div>
  );
  return <div className="price_row"><span className="plain_price">${g.price.toFixed(2)}</span></div>;
}

export function Pager({ total, totalPages, page, base, query }) {
  if (totalPages <= 1) return null;
  const link = (p) => `${base}?${new URLSearchParams({ ...query, page: p }).toString()}`;
  const win = 2;
  const start = Math.max(1, page - win);
  const end = Math.min(totalPages, page + win);
  const nums = [];
  for (let p = start; p <= end; p++) nums.push(p);
  return (
    <nav className="pager">
      {page > 1 ? <Link className="ghost-btn sm" to={link(page - 1)}>← Prev</Link> : <span className="ghost-btn sm disabled">← Prev</span>}
      <span className="pager_nums">
        {start > 1 ? <Link className="ghost-btn sm" to={link(1)}>1</Link> : null}
        {start > 2 ? <span className="tiny">…</span> : null}
        {nums.map((p) => p === page
          ? <span key={p} className="ghost-btn sm current">{p}</span>
          : <Link key={p} className="ghost-btn sm" to={link(p)}>{p}</Link>)}
        {end < totalPages - 1 ? <span className="tiny">…</span> : null}
        {end < totalPages ? <Link className="ghost-btn sm" to={link(totalPages)}>{totalPages}</Link> : null}
      </span>
      {page < totalPages ? <Link className="ghost-btn sm" to={link(page + 1)}>Next →</Link> : <span className="ghost-btn sm disabled">Next →</span>}
      <span className="tiny">Page {page} of {totalPages} · {total} items</span>
    </nav>
  );
}

export function GameCard({ g, i }) {
  const avg = g.stats.reviewCount ? g.stats.reviewSum / g.stats.reviewCount : 0;
  return (
    <Link className="gcard card-enter" style={i !== undefined ? { animationDelay: `${Math.min(i, 11) * 45}ms` } : undefined} to={`/games/${g.slug}`}>
      <img src={g.coverImage} loading="lazy" />
      <div className="gmeta"><b>{g.title}</b>
        <span className="genres">{(g.genres || []).slice(0, 2).join(', ')}</span>
        <span className="tiny">{g.stats.reviewCount ? `${avg.toFixed(1)}/5 (${g.stats.reviewCount})` : 'No user reviews'}{(g.price || 0) > 0 ? ((g.stats.keysAvailable || 0) > 0 ? ' · Keys in stock' : ' · Out of keys') : ''}</span>
        <Price g={g} />
      </div>
    </Link>
  );
}

export function ToyCard({ t, i }) {
  return (
    <Link className="gcard toy card-enter" style={i !== undefined ? { animationDelay: `${Math.min(i, 11) * 45}ms` } : undefined} to={`/toys/${t.slug}`}>
      <img src={t.coverImage} loading="lazy" />
      <div className="gmeta"><b>{t.title}</b>
        <span className="tiny" style={{ color: 'var(--amber)', fontWeight: 700, letterSpacing: '.08em' }}>MERCH · {t.category.toUpperCase()}</span>
        <span className="tiny">{t.brand}</span>
        <span className="tiny">{(t.stock || 0) > 0 ? `In stock (${t.stock})` : 'Sold out'}</span>
        <div className="price_row"><span className="plain_price">${t.price.toFixed(2)}</span></div>
      </div>
    </Link>
  );
}
