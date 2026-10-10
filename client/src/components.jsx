import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, createContext, useContext } from 'react';
import { api, priceOf } from './api.js';
import { BUILD } from './version.js';

function ApiStatus() {
  const [s, setS] = useState(null);
  useEffect(() => {
    api('/stats').then((d) => setS(`${d.games} games · ${d.toys} toys`)).catch(() => setS('API offline'));
  }, []);
  return <span className="tiny"> · API: {s || '…'}</span>;
}

/* ---------- toast host: one instance in App, reached via useToast() ---------- */
const ToastCtx = createContext(() => {});
export function ToastHost({ children }) {
  const [items, setItems] = useState([]);
  const push = (msg, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((xs) => [...xs.slice(-2), { id, msg, kind }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ===================================================================
   SIDEBAR — hairline ledger of sections, not a stack of brown boxes
   =================================================================== */
function Sidebar({ me, onLogout, theme, onTheme, collapsed, onToggle }) {
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
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); onLogout(); nav('/'); };
  return (
    <aside className="side-rail" aria-label="Account and settings">
      <div className="side-clip">
        <div className="side-in">
          {me ? (
            <div className="rail-sec">
              <div className="rail-user">
                <span className="avatar-chip lg">{(me.username || '?')[0].toUpperCase()}</span>
                <div><b>{me.username}</b><br /><span className="tiny">{me.role}</span></div>
              </div>
              <div className="rail-links">
                <Link to="/library">My Library</Link>
                <Link to="/orders">Orders</Link>
                <Link to={`/users/${me.username}`}>Profile</Link>
                <Link to="/settings">Settings</Link>
              </div>
              <div className="rail-cta">
                <button className="ghost-btn sm" onClick={logout}>Log out</button>
              </div>
            </div>
          ) : (
            <div className="rail-sec">
              <h3>Browsing as guest</h3>
              <p className="tiny">Keys, collectibles and order tracking unlock when you join.</p>
              <div className="rail-links">
                <Link to="/games?onSale=1">Today's deals</Link>
                <Link to="/register">Why join?</Link>
              </div>
              <div className="rail-cta">
                <Link className="cta-btn sm" to="/register">Join free</Link>
                <Link className="ghost-btn sm" to="/login">Log in</Link>
              </div>
            </div>
          )}

          <div className="rail-sec">
            <h3>Appearance</h3>
            <div className="row">
              <button className={'ghost-btn sm' + (theme === 'dark' ? ' current' : '')} onClick={() => onTheme('dark')}>Dark</button>
              <button className={'ghost-btn sm' + (theme === 'light' ? ' current' : '')} onClick={() => onTheme('light')}>Light</button>
            </div>
          </div>

          {me && (
            <div className="rail-sec">
              <h3>Content filter</h3>
              <button className={'ghost-btn sm' + (mature ? ' current' : '')} onClick={flipMature}>
                {mature ? 'Mature shown' : 'Mature hidden'}
              </button>
              <p className="tiny" style={{ marginTop: 8, marginBottom: 0 }}>
                {mature ? 'Mature titles are visible in the catalog.' : 'Mature titles are hidden from browsing.'}
              </p>
            </div>
          )}

          <div className="rail-sec browse-only">
            <h3>Sections</h3>
            <div className="rail-links">
              <Link to="/games">Store</Link>
              <Link to="/toys">Toys</Link>
              <Link to="/community">Community</Link>
              <Link to="/mods">Mods</Link>
              <Link to="/dev">Dev Portal</Link>
            </div>
          </div>

          <div className="rail-sec browse-only">
            <h3>For you</h3>
            <div className="rail-links">
              <Link to="/recommendations">Recommendations</Link>
              <Link to="/games?sort=popular">Top sellers</Link>
              <Link to="/games?sort=newest">Just released</Link>
              <Link to="/games?sort=rating">Top rated</Link>
            </div>
          </div>
        </div>
      </div>
      <button className="side-edge" title={collapsed ? 'Show panel' : 'Hide panel'}
        aria-expanded={!collapsed} aria-label={collapsed ? 'Show panel' : 'Hide panel'} onClick={onToggle}>
        {collapsed ? '›' : '‹'}
      </button>
    </aside>
  );
}

/* ===================================================================
   LAYOUT — one masthead in two tiers, one nav row. No duplicate bars.
   =================================================================== */
export function Layout({ me, onLogout, theme, onTheme, children }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [cartN, setCartN] = useState(0);
  const [menu, setMenu] = useState(false);
  const [hideSide, setHideSide] = useState(() => {
    try { return localStorage.getItem('pv-side') === 'hide'; } catch { return false; }
  });
  useEffect(() => {
    api('/cart').then((d) => setCartN((d.items || []).reduce((s, i) => s + i.qty, 0))).catch(() => {});
  }, [loc.pathname]);
  useEffect(() => { setMenu(false); }, [loc.pathname]);
  useEffect(() => { try { localStorage.setItem('pv-side', hideSide ? 'hide' : 'show'); } catch {} }, [hideSide]);
  const on = (to) => (loc.pathname === to ? 'active' : '');
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); onLogout(); nav('/'); };
  const genre = ['Action', 'RPG', 'Strategy', 'Indie', 'Adventure', 'Simulation', 'Horror', 'Free to Play'];

  return (
    <>
      <header className="topbar">
        {/* tier 1 — identity and account */}
        <div className="masthead">
          <button className="menu-btn" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>☰</button>
          <Link className="logo" to="/">PIXEL<span>VAULT</span></Link>
          <div className="top-actions">
            <form className="store_search head-search" onSubmit={(e) => {
              e.preventDefault();
              nav('/games?q=' + encodeURIComponent(e.target.q.value));
            }}>
              <input name="q" placeholder="Search the catalog" aria-label="Search games" />
              <button>Go</button>
            </form>
            <Link className="action-btn" to="/cart">Cart{cartN > 0 && <span className="cart-badge">{cartN}</span>}</Link>
            {me ? (
              <>
                <Link className="avatar-chip" to={`/users/${me.username}`} title={me.username}>
                  {(me.username || '?')[0].toUpperCase()}
                </Link>
                <button className="ghost-btn sm" onClick={logout}>Log out</button>
              </>
            ) : (
              <>
                <Link className="ghost-btn sm" to="/login">Log in</Link>
                <Link className="install-btn" to="/register">Join free</Link>
              </>
            )}
          </div>
        </div>
        {/* tier 2 — the single navigation row */}
        <div className="navbar">
          <nav className="navbar_inner" aria-label="Primary">
            <Link className={on('/games')} to="/games">Store</Link>
            <Link className={on('/toys')} to="/toys">Toys</Link>
            <Link className={on('/community')} to="/community">Community</Link>
            <Link className={on('/mods')} to="/mods">Mods</Link>
            <Link className={on('/dev')} to="/dev">Dev Portal</Link>
            <span className="rule-v" />
            <div className="drop">
              <button>Categories</button>
              <div className="drop_menu">
                {genre.map((g) => <Link key={g} to={`/games?genre=${encodeURIComponent(g)}`}>{g}</Link>)}
              </div>
            </div>
            <div className="drop">
              <button>Platforms</button>
              <div className="drop_menu">
                {['Windows', 'Mac', 'Linux', 'Steam Deck', 'VR'].map((p) => (
                  <Link key={p} to={`/games?platform=${encodeURIComponent(p)}`}>{p}</Link>
                ))}
              </div>
            </div>
            <div className="drop">
              <button>Merch</button>
              <div className="drop_menu">
                <Link to="/toys">All Collectibles</Link>
                <Link to="/toys?category=Plush">Plushies</Link>
                <Link to="/toys?category=Figure">Figures</Link>
                <Link to="/toys?category=Pins">Pins</Link>
              </div>
            </div>
            <div className="drop">
              <button>Your Store</button>
              <div className="drop_menu">
                <Link to="/recommendations">Recommendations</Link>
                <Link to="/library">Your Library</Link>
                <Link to="/orders">Order history</Link>
                <Link to="/settings">Settings</Link>
              </div>
            </div>
          </nav>
        </div>
      </header>

      <div className={'shell' + (menu ? ' menu-open' : '') + (hideSide ? ' no-side' : '')}>
        {menu && <div className="scrim" onClick={() => setMenu(false)} />}
        <Sidebar me={me} onLogout={onLogout} theme={theme} onTheme={onTheme}
          collapsed={hideSide} onToggle={() => setHideSide(!hideSide)} />
        <div className="shell-main">
          <main className="wrap page-enter" key={loc.pathname + loc.search}>{children}</main>
          <footer className="footer">
            PixelVault demo storefront — coursework project. Game data via the Steam Store API,
            merch via official brand stores. Delivered keys are DEMO placeholders.<br />
            <span className="tiny">build {BUILD}</span><ApiStatus />
          </footer>
        </div>
      </div>
    </>
  );
}

/* ---------- shared atoms ---------- */
export function Price({ g }) {
  if ((g.price || 0) <= 0) return <div className="price_row"><span className="free_tag">Free To Play</span></div>;
  if (g.discountPct > 0) return (
    <div className="price_row"><div className="discount_block">
      <div className="discount_pct">-{g.discountPct}%</div>
      <div className="discount_prices">
        <div className="discount_original_price">${g.price.toFixed(2)}</div>
        <div className="discount_final_price">${priceOf(g).toFixed(2)}</div>
      </div>
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
    <nav className="pager" aria-label="Pagination">
      {page > 1
        ? <Link className="ghost-btn sm" to={link(page - 1)}>Prev</Link>
        : <span className="ghost-btn sm disabled">Prev</span>}
      <span className="pager_nums">
        {start > 1 ? <Link className="ghost-btn sm" to={link(1)}>1</Link> : null}
        {start > 2 ? <span className="tiny">…</span> : null}
        {nums.map((p) => p === page
          ? <span key={p} className="ghost-btn sm current" aria-current="page">{p}</span>
          : <Link key={p} className="ghost-btn sm" to={link(p)}>{p}</Link>)}
        {end < totalPages - 1 ? <span className="tiny">…</span> : null}
        {end < totalPages ? <Link className="ghost-btn sm" to={link(totalPages)}>{totalPages}</Link> : null}
      </span>
      {page < totalPages
        ? <Link className="ghost-btn sm" to={link(page + 1)}>Next</Link>
        : <span className="ghost-btn sm disabled">Next</span>}
      <span className="tiny">Page {page} of {totalPages} · {total} items</span>
    </nav>
  );
}

export function GameCard({ g, i }) {
  const c = g.stats.reviewCount || 0;
  const avg = c ? g.stats.reviewSum / c : 0;
  const keys = g.stats.keysAvailable || 0;
  return (
    <Link className="gcard card-enter" style={i !== undefined ? { animationDelay: `${Math.min(i, 11) * 35}ms` } : undefined}
      to={`/games/${g.slug}`}>
      <img src={g.coverImage} loading="lazy" alt="" />
      <div className="gmeta">
        <b>{g.title}</b>
        <span className="genres">{(g.genres || []).slice(0, 2).join(' · ')}</span>
        <span className="tiny">
          {c ? `${avg.toFixed(1)}/5 · ${c} reviews` : 'No user reviews'}
          {(g.price || 0) > 0 ? (keys > 0 ? ` · ${keys} keys` : ' · out of keys') : ''}
        </span>
        <Price g={g} />
      </div>
    </Link>
  );
}

export function ToyCard({ t, i }) {
  const out = (t.stock || 0) <= 0;
  return (
    <Link className="gcard toy card-enter" style={i !== undefined ? { animationDelay: `${Math.min(i, 11) * 35}ms` } : undefined}
      to={`/toys/${t.slug}`}>
      <img src={t.coverImage} loading="lazy" alt="" />
      <div className="gmeta">
        <b>{t.title}</b>
        <span className="tiny" style={{ color: 'var(--accent)', fontWeight: 800, letterSpacing: '.1em' }}>
          {(t.category || 'MERCH').toUpperCase()}
        </span>
        <span className="genres">{t.brand}</span>
        <span className="tiny" style={out ? { color: 'var(--ember)' } : undefined}>
          {out ? 'Sold out' : `${t.stock} in stock`}
        </span>
        <div className="price_row"><span className="plain_price">${t.price.toFixed(2)}</span></div>
      </div>
    </Link>
  );
}