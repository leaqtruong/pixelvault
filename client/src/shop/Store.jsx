import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api, priceOf } from '../api.js';
import { GameCard, ToyCard, Price, Pager, useToast } from '../components.jsx';
import { useQuery } from './useQuery.js';

/* ===================================================================
   FAMILY 1 — CATALOG FRONT
   Split hero (art + veil) beside a ledger of real figures, then a
   horizontal category marquee, special offers as a price table,
   trending as a numbered index, merch as a shelf, forum as a strip.
   =================================================================== */

export function Store() {
  const q = useQuery();
  const [d, setD] = useState(null);
  const qs = new URLSearchParams(q).toString();
  useEffect(() => { setD(null); api('/games?' + qs).then(setD).catch(() => setD({ games: [] })); }, [qs]);
  if (!d) return <p className="muted">Loading…</p>;
  const heading = q.q ? `Results for "${q.q}"`
    : q.genre ? `${q.genre} titles`
    : q.tag ? `Tagged "${q.tag}"`
    : q.platform ? `${q.platform} titles`
    : 'All titles';
  return (
    <>
      <div className="sec-head" style={{ marginTop: 0 }}>
        <span className="ix">Catalog</span>
        <h1>{heading}</h1>
        <span className="tiny" style={{ marginLeft: 'auto' }}>{d.total} results</span>
      </div>
      <div className="store_layout">
        <aside>
          <div className="side_box">
            <h4>Price</h4>
            <Link className={q.maxPrice === '0' ? 'on' : ''} to="/games?maxPrice=0">Free to play</Link>
            <Link to="/games?maxPrice=10">Under $10</Link>
            <Link to="/games?maxPrice=20">Under $20</Link>
            <Link to="/games?maxPrice=40">Under $40</Link>
          </div>
          {(d.genres || []).length > 0 && (
            <div className="side_box">
              <h4>Genres</h4>
              {d.genres.map((g) => (
                <Link key={g} className={q.genre === g ? 'on' : ''} to={`/games?genre=${encodeURIComponent(g)}`}>{g}</Link>
              ))}
            </div>
          )}
          {(d.tags || []).length > 0 && (
            <div className="side_box">
              <h4>Popular tags</h4>
              {d.tags.map((t) => (
                <Link key={t} className={q.tag === t ? 'on' : ''} to={`/games?tag=${encodeURIComponent(t)}`}>{t}</Link>
              ))}
            </div>
          )}
          {(d.categories || []).length > 0 && (
            <div className="side_box">
              <h4>Features</h4>
              {d.categories.map((c) => (
                <Link key={c} className={q.feature === c ? 'on' : ''} to={`/games?feature=${encodeURIComponent(c)}`}>{c}</Link>
              ))}
            </div>
          )}
          {(d.platforms || []).length > 1 && (
            <div className="side_box">
              <h4>Platforms</h4>
              {d.platforms.map((p) => (
                <Link key={p} className={q.platform === p ? 'on' : ''} to={`/games?platform=${encodeURIComponent(p)}`}>{p}</Link>
              ))}
            </div>
          )}
          <div className="side_box">
            <h4>Sort and show</h4>
            <Link className={q.sort === 'popular' ? 'on' : ''} to="/games?sort=popular">Top sellers</Link>
            <Link className={q.sort === 'newest' ? 'on' : ''} to="/games?sort=newest">Just released</Link>
            <Link className={q.sort === 'rating' ? 'on' : ''} to="/games?sort=rating">Top rated</Link>
            <Link className={q.sort === 'priceAsc' ? 'on' : ''} to="/games?sort=priceAsc">Price, low first</Link>
            <Link className={q.onSale ? 'on' : ''} to="/games?onSale=1">Special offers</Link>
          </div>
        </aside>
        <div>
          <div className="chips">
            <Link className={'chip' + (!q.genre && !q.feature && !q.platform ? ' on' : '')} to="/games">Everything</Link>
            {(d.genres || []).slice(0, 10).map((g) => (
              <Link key={g} className={'chip' + (q.genre === g ? ' on' : '')} to={`/games?genre=${encodeURIComponent(g)}`}>{g}</Link>
            ))}
            {(q.q || q.onSale || q.platform || q.feature || q.maxPrice) && <Link className="chip on" to="/games">Reset filters</Link>}
          </div>
          <div className="card-grid">{(d.games || []).map((g, ix) => <GameCard key={g._id} g={g} i={ix} />)}</div>
          {!(d.games || []).length && (
            <div className="empty">
              <h3>Nothing on the shelf</h3>
              <p>No titles match {q.q ? `"${q.q}" ` : ''}{q.genre ? `in ${q.genre} ` : ''}{q.feature ? `with ${q.feature} ` : ''}{q.platform ? `on ${q.platform} ` : ''}right now.</p>
              <Link className="cta-btn" to="/games">Reset filters</Link>
            </div>
          )}
          <Pager total={d.total} totalPages={d.totalPages} page={d.page} base="/games" query={q} />
        </div>
      </div>
    </>
  );
}

/* ===================================================================
   FAMILY 3 — LONG DOCUMENT
   Editorial column on the left, sticky purchase rail on the right.
   =================================================================== */
