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
export function Toys() {
  const q = useQuery();
  const [d, setD] = useState(null);
  const qs = new URLSearchParams(q).toString();
  useEffect(() => { setD(null); api('/toys?' + qs).then(setD).catch(() => setD({ toys: [] })); }, [qs]);
  if (!d) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="sec-head" style={{ marginTop: 0 }}>
        <span className="ix">Merch</span>
        <h1>Toys and collectibles</h1>
        <span className="tiny" style={{ marginLeft: 'auto' }}>{d.total} results</span>
      </div>
      <div className="store_layout">
        <aside>
          <div className="side_box">
            <h4>Category</h4>
            <Link to="/toys">Everything</Link>
            {(d.categories || []).map((c) => (
              <Link key={c} to={`/toys?category=${encodeURIComponent(c)}`}>{c}</Link>
            ))}
          </div>
          <div className="side_box">
            <h4>Brand</h4>
            {(d.brands || []).slice(0, 12).map((b) => (
              <Link key={b} to={`/toys?brand=${encodeURIComponent(b)}`}>{b.split(' (')[0]}</Link>
            ))}
          </div>
        </aside>
        <div>
          <div className="card-grid">{(d.toys || []).map((t, ix) => <ToyCard key={t._id} t={t} i={ix} />)}</div>
          {!(d.toys || []).length && (
            <div className="empty">
              <h3>The toy shelf is bare</h3>
              <p>No collectibles match {q.category ? `category "${q.category}" ` : ''}{q.brand ? `${q.brand} ` : ''}right now.</p>
              <Link className="cta-btn" to="/toys">Browse everything</Link>
            </div>
          )}
          <Pager total={d.total} totalPages={d.totalPages} page={d.page} base="/toys" query={q} />
        </div>
      </div>
    </>
  );
}
