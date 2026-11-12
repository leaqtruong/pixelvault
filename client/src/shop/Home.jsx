import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api, priceOf } from '../api.js';
import { GameCard, ToyCard, Price, Pager, useToast } from '../components.jsx';

/* ===================================================================
   FAMILY 1 — CATALOG FRONT
   Split hero (art + veil) beside a ledger of real figures, then a
   horizontal category marquee, special offers as a price table,
   trending as a numbered index, merch as a shelf, forum as a strip.
   =================================================================== */
function SplitHero({ items, ledger }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef(null);
  const n = items.length;
  useEffect(() => {
    if (paused || n < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % n), 7000);
    return () => clearInterval(t);
  }, [paused, n]);
  if (!n) return <div className="empty"><h3>Catalog is empty</h3><p>Nothing is published yet.</p></div>;
  const go = (d) => setIdx((i) => (i + d + n) % n);
  const f = items[idx];
  // Trim on a word boundary so the blurb never ends mid-word.
  const raw = (f.shortDescription || f.description || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const sub = raw.length > 190 ? raw.slice(0, raw.lastIndexOf(' ', 190)) + '…' : raw;
  return (
    <section className="hero">
      <div className="hero-art"
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; setPaused(true); }}
        onTouchEnd={(e) => {
          if (touch.current == null) { setPaused(false); return; }
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          setPaused(false);
        }}>
        <Link to={`/games/${f.slug}`} aria-label={f.title} style={{ display: 'block', position: 'absolute', inset: 0 }}>
          <img src={f.coverImage} alt="" />
        </Link>
        <div className="split-veil">
          <div className="split-kicker">Featured · {(f.genres || []).slice(0, 2).join(' · ')}</div>
          <h1 className="split-title">{f.title}</h1>
          <p className="split-sub">{sub || 'Delivered as an encrypted demo key the moment checkout clears.'}</p>
          <div className="split-cta">
            <Link className="cta-btn" to={`/games/${f.slug}`}>View title</Link>
            <Price g={f} />
          </div>
        </div>
        {n > 1 && (
          <>
            <span className="split-tag">{idx + 1} / {n}</span>
            <button className="carousel_arrow prev" onClick={() => go(-1)} aria-label="Previous featured title">‹</button>
            <button className="carousel_arrow next" onClick={() => go(1)} aria-label="Next featured title">›</button>
          </>
        )}
      </div>

      <aside className="ledger" aria-label="Catalog totals">
        <div className="ledger-head">
          <h3>The ledger</h3>
        </div>
        <div className="ledger-grid">
          <div className="ledger-item"><span className="k">Titles</span><span className="v">{ledger.titles}</span></div>
          <div className="ledger-item"><span className="k">Keys issued</span><span className="v">{Number(ledger.keysIssued || 0).toLocaleString()}</span></div>
          <div className="ledger-item"><span className="k">On offer</span><span className="v">{ledger.onSale}</span></div>
          <div className="ledger-item"><span className="k">Collectibles</span><span className="v">{ledger.toys}</span></div>
          <div className="ledger-item"><span className="k">Orders</span><span className="v">{ledger.orders}</span></div>
        </div>
        <p className="ledger-note">
          <span className="live-dot" />
          Player counts and review verdicts are pulled live from the Steam Web API.
        </p>
      </aside>
    </section>
  );
}

export function Home() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/home').then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return (
    <div className="empty">
      <h3>Cannot reach the server</h3>
      <p>Start MongoDB, then restart this website window.</p>
      <button className="cta-btn sm" onClick={() => window.location.reload()}>Retry</button>
    </div>
  );
  if (!d) return <p className="muted">Loading…</p>;

  const seen = new Set();
  const hero = [...(d.featured || []), ...(d.deals || []), ...(d.fresh || [])].filter((g) => {
    if (seen.has(g._id)) return false;
    seen.add(g._id);
    return true;
  }).slice(0, 8);
  const L = d.ledger || { titles: 0, keysIssued: 0, onSale: 0, avgOff: 0, toys: 0, orders: 0 };

  return (
    <>
      <SplitHero items={hero} ledger={L} />

      {(d.catTiles || []).length ? (
        <section>
          <div className="sec-head"><span className="ix">01</span><h2>Browse by category</h2>
            <Link className="more" to="/games">Full catalog</Link></div>
          <div className="marquee">
            {d.catTiles.map((t) => (
              <Link key={t.name} to={`/games?genre=${encodeURIComponent(t.name)}`}>
                <img src={t.img} loading="lazy" alt="" /><b>{t.name}</b>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {(d.deals || []).length ? (
        <section>
          <div className="sec-head"><span className="ix">02</span><h2>Special offers</h2>
            <Link className="more" to="/games?onSale=1">All offers</Link></div>
          <table className="ptable">
            <thead><tr>
              <th><span className="tiny">Art</span></th><th>Title</th><th>Genre</th><th>Was</th><th>Now</th><th>Off</th><th>Key</th>
            </tr></thead>
            <tbody>
              {d.deals.map((g) => {
                return (
                  <tr key={g._id}>
                    <td><img className="t-art" src={g.coverImage} loading="lazy" alt="" /></td>
                    <td><Link className="t-name" to={`/games/${g.slug}`}>{g.title}</Link></td>
                    <td className="t-genre">{(g.genres || []).slice(0, 2).join(', ')}</td>
                    <td className="t-was">${g.price.toFixed(2)}</td>
                    <td className="t-now">${priceOf(g).toFixed(2)}</td>
                    <td><span className="t-off">-{g.discountPct}%</span></td>
                    <td className="t-keys">on demand</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {(d.fresh || []).length ? (
        <section>
          <div className="sec-head"><span className="ix">03</span><h2>New and trending</h2>
            <Link className="more" to="/games?sort=newest">Just released</Link></div>
          <div className="numlist">
            {d.fresh.slice(0, 6).map((g, ix) => {
              const c = g.stats.reviewCount || 0;
              return (
                <Link className="numrow" key={g._id} to={`/games/${g.slug}`}>
                  <span className="n">{String(ix + 1).padStart(2, '0')}</span>
                  <img src={g.coverImage} loading="lazy" alt="" />
                  <span>
                    <span className="nm">{g.title}</span>
                    <span className="gn">{(g.genres || []).slice(0, 3).join(' · ')}</span>
                  </span>
                  <span className="num-extra tiny num">{c ? (g.stats.reviewSum / c).toFixed(1) + '/5' : 'no reviews'}</span>
                  <Price g={g} />
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {(d.toys || []).length ? (
        <section>
          <div className="sec-head"><span className="ix">04</span><h2>Toys and collectibles</h2>
            <Link className="more" to="/toys">Shop all merch</Link></div>
          <div className="shelf">{d.toys.map((t, ix) => <ToyCard key={t._id} t={t} i={ix} />)}</div>
        </section>
      ) : null}

      {(d.threads || []).length ? (
        <section>
          <div className="sec-head"><span className="ix">05</span><h2>From the forums</h2>
            <Link className="more" to="/community">All threads</Link></div>
          {d.threads.map((t) => (
            <Link className="thread" key={t._id} to={`/community/p/${t._id}`}>
              <span style={{ whiteSpace: 'normal', color: 'var(--bright)', fontSize: 13 }}>{t.title}</span>
              <span>{t.board} · @{t.author?.username || 'anon'}</span>
            </Link>
          ))}
        </section>
      ) : null}
    </>
  );
}

