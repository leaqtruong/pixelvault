import { Link, useNavigate } from 'react-router-dom';
import { api, priceOf } from './api.js';

export function useMe() { return null; }

export function Layout({ me, onLogout, theme, onTheme, children }) {
  const nav = useNavigate();
  return (
    <>
      <header className="topbar">
        <div className="topbar_inner">
          <Link className="logo" to="/">PIXEL<span>VAULT</span></Link>
          <nav>
            <Link to="/games">Store</Link>
            <Link to="/toys">Toys</Link>
            <Link to="/community">Community</Link>
            <Link to="/mods">Mods</Link>
            <Link to="/dev">Dev Portal</Link>
          </nav>
          <div className="top-actions">
            <Link to="/cart">Cart</Link>
            <button className="ghost-btn sm" title="Toggle light / dark" onClick={onTheme}>{theme === 'light' ? '🌙 Dark' : '☀️ Light'}</button>
            <Link to="/settings">Settings</Link>
            {me ? (
              <>
                <Link to={`/users/${me.username}`}>{me.username}</Link>
                <button className="ghost-btn sm" onClick={async () => { await api('/auth/logout', { method: 'POST' }); onLogout(); nav('/'); }}>Logout</button>
              </>
            ) : (
              <>
                <Link className="ghost-btn sm" to="/login">login</Link>
                <Link className="install-btn" to="/register">Join free</Link>
              </>
            )}
          </div>
        </div>
      </header>
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
      <main className="wrap">{children}</main>
      <footer className="footer">PixelVault demo storefront — coursework project. Game data via Steam Store API, merch via official stores. Keys are DEMO placeholders.</footer>
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

export function GameCard({ g }) {
  const avg = g.stats.reviewCount ? g.stats.reviewSum / g.stats.reviewCount : 0;
  return (
    <Link className="gcard" to={`/games/${g.slug}`}>
      <img src={g.coverImage} loading="lazy" />
      <div className="gmeta"><b>{g.title}</b>
        <span className="genres">{(g.genres || []).slice(0, 2).join(', ')}</span>
        <span className="tiny">{g.stats.reviewCount ? `${avg.toFixed(1)} ★ (${g.stats.reviewCount})` : 'No user reviews'}{(g.price || 0) > 0 ? ((g.stats.keysAvailable || 0) > 0 ? ' · Keys in stock' : ' · Out of keys') : ''}</span>
        <Price g={g} />
      </div>
    </Link>
  );
}

export function ToyCard({ t }) {
  return (
    <Link className="gcard toy" to={`/toys/${t.slug}`}>
      <img src={t.coverImage} loading="lazy" />
      <div className="gmeta"><b>{t.title}</b>
        <span className="tiny" style={{ color: 'var(--amber)' }}>★ {t.category} · {t.brand}</span>
        <span className="tiny">{(t.stock || 0) > 0 ? `In stock (${t.stock})` : 'Sold out'}</span>
        <div className="price_row"><span className="plain_price">${t.price.toFixed(2)}</span></div>
      </div>
    </Link>
  );
}
