import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { GameCard, useToast } from '../components.jsx';

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
