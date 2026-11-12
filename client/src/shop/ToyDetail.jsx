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
export function ToyDetail() {
  const { slug } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const toast = useToast();
  useEffect(() => { api('/toys/' + slug).then(setD).catch((e) => setErr(e.message)); }, [slug]);
  const nav = useNavigate();
  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  const { toy, relatedGame } = d;
  const out = (toy.stock || 0) === 0;
  const add = async () => {
    try { await api('/cart/add', { method: 'POST', body: { toyId: toy._id } }); toast('Added to cart'); nav('/cart'); }
    catch (e) { setErr(e.message); toast(e.message, 'err'); }
  };
  return (
    <>
      <p className="crumbs">
        <Link to="/toys">Collectibles</Link><span className="sep">/</span>
        <Link to={`/toys?category=${encodeURIComponent(toy.category)}`}>{toy.category}</Link>
        <span className="sep">/</span>{toy.title}
      </p>
      <h1>{toy.title}</h1>
      <div className="detail_grid">
        <div>
          <div className="shot_main"><img src={toy.coverImage} alt="" /></div>
          <div className="doc">
            <h3>About this collectible</h3>
            <p style={{ fontSize: 13.5 }}>{toy.description}</p>
            {relatedGame && (
              <p><Link className="ghost-btn sm" to={`/games/${relatedGame.slug}`}>View the game: {relatedGame.title}</Link></p>
            )}
          </div>
          <div className="doc">
            <h3>Details</h3>
            <div className="review_line"><span className="k">Brand</span><span>{toy.brand}</span></div>
            <div className="review_line"><span className="k">Category</span><span>{toy.category}</span></div>
            <div className="review_line"><span className="k">Size</span><span>{toy.size}</span></div>
            <div className="review_line"><span className="k">Material</span><span>{toy.material}</span></div>
            <div className="review_line"><span className="k">Warehouse</span><span>{toy.warehouse}</span></div>
          </div>
        </div>
        <aside className="buy-rail">
          <img className="header_img toy" src={toy.coverImage} alt="" />
          <p style={{ fontSize: 13, marginBottom: 6 }}>{toy.tagline}</p>
          <div className="tiny">{toy.brand}</div>
          <div className="rail-price"><div className="price_row"><span className="plain_price">${toy.price.toFixed(2)}</span></div></div>
          <div className="buy-area">
            <h4>Ships from {toy.warehouse}</h4>
            <p className="tiny" style={out ? { color: 'var(--ember)' } : undefined}>
              {out ? 'Sold out — check back soon' : `${toy.stock} in stock`}
            </p>
            <div className="row">
              <button className="cta-btn sm" disabled={out} onClick={add}>Add to cart</button>
            </div>
          </div>
        </aside>
      </div>
      {err && <p className="err">{err}</p>}
    </>
  );
}