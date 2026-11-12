import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { GameCard, useToast } from '../components.jsx';

export function Cart() {
  const [d, setD] = useState(null);
  const toast = useToast();
  const load = () => api('/cart').then(setD).catch(() => setD({ items: [] }));
  useEffect(() => { load(); }, []);
  const setQty = async (key, qty) => {
    try { await api('/cart/qty', { method: 'POST', body: { key, qty } }); load(); }
    catch (er) { toast(er.message, 'err'); }
  };
  const rm = async (key) => {
    try { await api('/cart/remove', { method: 'POST', body: { key } }); toast('Removed from cart'); load(); }
    catch (er) { toast(er.message, 'err'); }
  };
  if (!d) return <p className="muted">Loading…</p>;
  const units = d.items.reduce((s, i) => s + i.qty, 0);
  return (
    <>
      <div className="sec-head" style={{ marginTop: 0 }}>
        <span className="ix">Checkout</span>
        <h1>Your cart</h1>
        <span className="tiny" style={{ marginLeft: 'auto' }}>{units} {units === 1 ? 'unit' : 'units'}</span>
      </div>
      {d.items.length ? (
        <div className="two-col">
          <div>
            <table className="ptable">
              <thead><tr>
                <th></th><th>Item</th><th>Type</th><th>Unit</th><th>Qty</th><th>Line</th><th></th>
              </tr></thead>
              <tbody>
                {d.items.map((i) => {
                  const toy = (i.kind || 'game') === 'toy';
                  const href = toy ? `/toys/${i.slug}` : `/games/${i.slug}`;
                  return (
                    <tr key={i.key}>
                      <td><img className="t-art" src={i.coverImage} alt="" /></td>
                      <td><Link className="t-name" to={href}>{i.title}</Link></td>
                      <td className="t-genre">{toy ? 'Collectible' : i.edition || 'Digital'}</td>
                      <td className="num">${i.unitPrice.toFixed(2)}</td>
                      <td>
                        <input type="number" value={i.qty} min="1" max="9" aria-label={`Quantity for ${i.title}`}
                          style={{ width: 58, padding: '5px 7px' }}
                          onChange={(e) => setQty(i.key, e.target.value)} />
                      </td>
                      <td className="t-now">${(i.unitPrice * i.qty).toFixed(2)}</td>
                      <td><button className="ghost-btn sm" onClick={() => rm(i.key)} aria-label={`Remove ${i.title}`}>Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="buy-rail" style={{ position: 'static' }}>
            <h3>Summary</h3>
            <div className="sum-row total"><span className="k">Subtotal</span><span className="v num">${d.subtotal.toFixed(2)}</span></div>
            <div className="sum-row"><span className="k">Units</span><span className="v num">{units}</span></div>
            <p className="tiny" style={{ margin: '12px 0 14px' }}>
              Tax and shipping are calculated on the next step. Digital keys are delivered instantly.
            </p>
            <Link className="cta-btn" style={{ display: 'block', textAlign: 'center' }} to="/checkout">Continue to checkout</Link>
            <Link className="ghost-btn sm" style={{ display: 'block', textAlign: 'center', marginTop: 8 }} to="/games">Keep browsing</Link>
          </div>
        </div>
      ) : (
        <div className="empty">
          <h3>Your cart is empty</h3>
          <p>Nothing queued for checkout. Browse the catalog or the toy shelf.</p>
          <Link className="cta-btn" to="/games">Open the catalog</Link>
        </div>
      )}
    </>
  );
}

