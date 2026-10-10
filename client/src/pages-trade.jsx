import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { GameCard, useToast } from './components.jsx';

export function Cart() {
  const [d, setD] = useState(null);
  const toast = useToast();
  const load = () => api('/cart').then(setD).catch(() => setD({ items: [] }));
  useEffect(load, []);
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
            <div className="ledger-row"><span className="k">Subtotal</span><span className="v num">${d.subtotal.toFixed(2)}</span></div>
            <div className="ledger-row"><span className="k">Units</span><span className="v num">{units}</span></div>
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

export function Checkout() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [method, setMethod] = useState('standard');
  const nav = useNavigate();
  useEffect(() => { api('/checkout/summary?method=' + method).then(setD).catch((e) => setErr(e.message)); }, [method]);
  const place = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await api('/checkout/place', { method: 'POST', body: { method, fullName: f.get('fullName'), street: f.get('street'), city: f.get('city'), region: f.get('region'), postal: f.get('postal'), country: f.get('country') || 'US', phone: f.get('phone') } });
      nav('/orders/' + r.orderId);
    } catch (er) { setErr(er.message); }
  };
  if (err && !d) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  const addr = (d.addresses || [])[0] || {};
  return (
    <>
      <h1>Checkout</h1>
      <div className="two-col"><div className="panel">
        <form onSubmit={place}>
          <h3>1 · Shipping method</h3>
          {['standard', 'express', 'overnight'].map((m) => <label key={m} style={{ display: 'block' }}><input type="radio" checked={method === m} onChange={() => setMethod(m)} /> {m}</label>)}
          <h3>2 · Ship to</h3>
          <input name="fullName" placeholder="Full name" defaultValue={addr.fullName} required />
          <input name="street" placeholder="Street" defaultValue={addr.street} required />
          <div className="row"><input name="city" placeholder="City" defaultValue={addr.city} required /><input name="postal" placeholder="ZIP" defaultValue={addr.postal} required /></div>
          <div className="row"><input name="country" placeholder="Country" defaultValue={addr.country || 'US'} /><input name="phone" placeholder="Phone" defaultValue={addr.phone} /></div>
          <h3>3 · Payment (demo)</h3>
          <button className="cta-btn big">Pay ${d.grand.toFixed(2)} →</button>
        </form>
        {err && <p className="err">{err}</p>}
      </div>
        <div className="panel"><h3>Order summary</h3>
          {d.items.map((i) => <p key={i.key}>{i.qty}× {i.title} — ${(i.unitPrice * i.qty).toFixed(2)}</p>)}
          <hr /><p>Subtotal: ${d.subtotal.toFixed(2)}</p><p>Tax: ${d.tax.toFixed(2)}</p><p>Shipping: ${d.shipCost.toFixed(2)}</p><h3>Total: ${d.grand.toFixed(2)}</h3>
        </div>
      </div>
    </>
  );
}

export function Orders() {
  const [d, setD] = useState(null);
  const [f, setF] = useState('all');
  useEffect(() => { api('/orders').then(setD).catch(() => setD({ orders: [] })); }, []);
  if (!d) return <p className="muted">Loading…</p>;
  const all = d.orders || [];
  const rows = f === 'all' ? all : all.filter((o) => o.status === f);
  const states = [...new Set(all.map((o) => o.status))];
  const spent = all.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + (o.grandTotal || 0), 0);
  return (
    <>
      <div className="sec-head" style={{ marginTop: 0 }}>
        <span className="ix">Account</span>
        <h1>Order history</h1>
        <span className="tiny" style={{ marginLeft: 'auto' }}>{all.length} orders</span>
      </div>
      <div className="kpi-row">
        <div className="kpi"><span>Orders placed</span><b>{all.length}</b></div>
        <div className="kpi"><span>Lifetime spend</span><b>${spent.toFixed(2)}</b></div>
        <div className="kpi"><span>In progress</span><b>{all.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length}</b></div>
      </div>
      <div className="chips">
        <button className={'chip' + (f === 'all' ? ' on' : '')} onClick={() => setF('all')}>All ({all.length})</button>
        {states.map((s) => (
          <button key={s} className={'chip' + (f === s ? ' on' : '')} onClick={() => setF(s)}>
            {s} ({all.filter((o) => o.status === s).length})
          </button>
        ))}
      </div>
      {rows.length ? (
        <table className="ptable">
          <thead><tr><th>Order</th><th>Placed</th><th>Items</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o._id}>
                <td><Link className="t-name" to={`/orders/${o._id}`}>#{String(o._id).slice(-6).toUpperCase()}</Link></td>
                <td className="t-genre">{new Date(o.createdAt).toLocaleDateString()}</td>
                <td className="t-genre">{(o.items || []).reduce((s, i) => s + i.qty, 0)} units</td>
                <td className="t-keys">{o.status}</td>
                <td className="t-now">${o.grandTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">
          <h3>No orders yet</h3>
          <p>{all.length ? 'Nothing matches that filter.' : 'Once you buy something it shows up here with tracking.'}</p>
          <Link className="cta-btn" to="/games">Browse the catalog</Link>
        </div>
      )}
    </>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  useEffect(() => { api('/orders/' + id).then(setD).catch(() => setD({ err: true })); }, [id]);
  if (!d) return <p className="muted">Loading…</p>;
  if (d.err) return <p className="err">Order not found.</p>;
  const { order, plainById } = d;
  return (
    <><h1>Order #{String(order._id).slice(-6)}</h1>
      <p className="tiny">{new Date(order.createdAt).toLocaleString()} · status: <b>{order.status}</b></p>
      <div className="two-col"><div className="panel"><h3>Items</h3>
        {order.items.map((it, ix) => <div key={ix}><p>{it.qty}× {it.title} ({it.edition}) — ${(it.unitPrice * it.qty).toFixed(2)}</p>
          {(it.keyIds || []).map((k) => <p key={k._id}><code>{plainById[k._id]}</code> <span className="tiny">· Steam key</span></p>)}
        </div>)}
        <hr /><h3>Total ${order.grandTotal.toFixed(2)}</h3></div>
        <div className="panel"><h3>Shipment</h3>
          {order.shipment ? <><p>Tracking: <code>{order.shipment.tracking}</code></p><p className="tiny">{order.shipment.method} · {order.shipment.status}</p></>
            : <p>Digital order — keys in <Link to="/library">library</Link>.</p>}
        </div></div>
    </>
  );
}

export function Library() {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('games');
  const [q, setQ] = useState('');
  const toast = useToast();
  useEffect(() => { api('/library').then(setD).catch(() => setD(null)); }, []);
  if (!d) return <div className="empty"><h3>Your library is private</h3><p className="muted">Login to see games you own, keys and collectibles.</p><Link className="cta-btn" to="/login">Login</Link></div>;
  const { user, keysByGame, plainById } = d;
  const play = async (gid) => { await api(`/library/play/${gid}`, { method: 'POST' }); setD({ ...d, user: (await api('/library')).user }); };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast('Key copied'); } catch { toast('Copy failed — select manually', 'err'); }
  };
  const libFilter = (t) => !q || (t || '').toLowerCase().includes(q.toLowerCase());
  const games = (user.library || []).filter((e) => e.game && libFilter(e.game.title));
  const toys = (user.toyLibrary || []).filter((e) => e.toy && libFilter(e.toy.title));
  const wish = (user.wishlist || []).filter((g) => g && libFilter(g.title));
  const toysWish = (user.toyWishlist || []).filter((t) => t && libFilter(t.title));
  return (
    <>
      <h1>{user.username}'s library</h1>
      <div className="chips">
        <input placeholder="Filter library…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
        {['games', 'toys', 'wishlist'].map((t) => (
          <button key={t} className={'chip' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>
            {t === 'games' ? `Games (${games.length})` : t === 'toys' ? `Collectibles (${toys.length})` : `Wishlist (${wish.length + toysWish.length})`}
          </button>
        ))}
      </div>
      <p className="tiny">Demo keys look like <code>DEMO-XXXXX-XXXXX-XXXXX</code> (placeholders).</p>
      {tab === 'games' && (
        games.length ? <div className="card-grid">
          {games.map((e, ix) => (
            <div key={ix} className="gcard"><img src={e.game.coverImage} /><div className="gmeta"><b>{e.game.title}</b>
              <span className="tiny">{e.edition} · {Math.floor((e.playMinutes || 0) / 60)}h {(e.playMinutes || 0) % 60}m</span>
              <span className="tiny">Achievements: {(e.achievements || []).map((a) => a.key).join(', ') || 'none yet'}</span>
              {(keysByGame[String(e.game._id)] || []).map((k) => (
                <div key={k._id} className="row" style={{ alignItems: 'center' }}>
                  <code className="tiny">{plainById[String(k._id)]}</code>
                  <button className="ghost-btn sm" onClick={() => copy(plainById[String(k._id)])}>Copy</button>
                </div>
              ))}
              <button className="cta-btn sm" onClick={() => play(e.game._id)}>Play +30min</button>
              <Link className="ghost-btn sm" to={`/games/${e.game.slug}`}>Store page</Link>
            </div></div>
          ))}
        </div> : <div className="empty"><h3>No games here</h3><p className="muted">{q ? 'Nothing matches your filter.' : 'Games you buy land here automatically.'}</p><Link className="cta-btn" to="/games">Browse the store</Link></div>
      )}
      {tab === 'toys' && (
        toys.length ? <div className="card-row">
          {toys.map((e, ix) => (
            <Link key={ix} className="gcard toy" to={`/toys/${e.toy.slug}`}><img src={e.toy.coverImage} /><div className="gmeta"><b>{e.toy.title}</b>
              <span className="tiny">×{e.qty}</span><div className="price_row"><span className="plain_price">${e.toy.price.toFixed(2)}</span></div></div></Link>
          ))}
        </div> : <div className="empty"><h3>No collectibles yet</h3><p className="muted">{q ? 'Nothing matches your filter.' : 'Plushies and figures you buy show up here.'}</p><Link className="cta-btn" to="/toys">Browse the toy shelf</Link></div>
      )}
      {tab === 'wishlist' && (
        (wish.length || toysWish.length) ? <>
          {!!wish.length && <><h3>Games</h3><div className="card-row">
            {wish.map((g) => <Link key={g._id} className="gcard sm" to={`/games/${g.slug}`}><img src={g.coverImage} /><div className="gmeta"><b>{g.title}</b><span className="tiny">${(g.price * (1 - (g.discountPct || 0) / 100)).toFixed(2)}</span></div></Link>)}
          </div></>}
          {!!toysWish.length && <><h3>Collectibles</h3><div className="card-row">
            {toysWish.map((t) => <Link key={t._id} className="gcard sm toy" to={`/toys/${t.slug}`}><img src={t.coverImage} /><div className="gmeta"><b>{t.title}</b><span className="tiny">${t.price.toFixed(2)}</span></div></Link>)}
          </div></>}
        </> : <div className="empty"><h3>Wishlist is empty</h3><p className="muted">Tap + Wishlist on anything you're watching.</p></div>
      )}
    </>
  );
}

export function Recommendations() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/recommendations').then(setD).catch(() => setD({ recs: [] })); }, []);
  if (!d) return <p className="muted">Loading…</p>;
  return (<><h1>For you</h1><p className="tiny">Based on: {(d.topGenres || []).join(', ')}</p>
    <div className="card-grid">{(d.recs || []).map((g, ix) => <GameCard key={g._id} g={g} i={ix} />)}</div></>);
}
