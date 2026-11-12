import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { AdminUsers } from './AdminUsers.jsx';
import { AdminGames } from './AdminGames.jsx';
import { AdminToys } from './AdminToys.jsx';
import { AdminOrders } from './AdminOrders.jsx';
import { AdminPayments } from './AdminPayments.jsx';
import { AdminPayouts } from './AdminPayouts.jsx';
import { AdminModeration } from './AdminModeration.jsx';

const EMPTY = {
  orders: [], posts: [], reviews: [], users: [], games: [], toys: [],
  payments: [], devRequests: [], payouts: [], stats: {},
};

export function Admin() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('overview');
  const [q, setQ] = useState('');
  const load = () => api('/admin')
    .then((r) => { setD(r); setErr(''); })
    .catch((e) => { setErr(e.message); setD(EMPTY); });
  useEffect(() => { load(); }, []);
  if (!d) return <p className="muted">Loading…</p>;
  if (err) return <p className="err">{err}</p>;

  const stats = d.stats || {};
  const revenue = Number(stats.revenue || 0);
  const toShip = d.orders.filter((o) => o.shipment && ['packing', 'shipped'].includes(o.shipment.status)).length;
  const tabs = [
    ['overview', 'Overview'],
    ['users', `Users (${stats.users ?? d.users.length})`],
    ['games', `Games (${stats.games ?? d.games.length})`],
    ['toys', `Toys (${stats.toys ?? d.toys.length})`],
    ['orders', `Orders (${d.orders.length})`],
    ['payments', `Payments (${d.payments.length})`],
    ['payouts', `Payouts (${d.payouts.length})`],
    ['devs', `Dev requests (${d.devRequests.length})`],
    ['posts', `Posts (${d.posts.length})`],
    ['reviews', `Reviews (${d.reviews.length})`],
  ];

  return (<>
    <div className="sec-head" style={{ marginTop: 0 }}>
      <span className="ix">Admin</span>
      <h1>Store desk</h1>
      <span className="tiny" style={{ marginLeft: 'auto' }}>owner controls · users, catalog, orders, payments, developers</span>
    </div>
    <div className="kpi-row">
      <div className="kpi"><span>Users</span><b>{stats.users ?? d.users.length}</b></div>
      <div className="kpi"><span>Games</span><b>{stats.games ?? d.games.length}</b></div>
      <div className="kpi"><span>Toys</span><b>{stats.toys ?? d.toys.length}</b></div>
      <div className="kpi"><span>Paid revenue</span><b>${revenue.toFixed(2)}</b></div>
      <div className="kpi"><span>To ship</span><b>{toShip}</b></div>
      <div className="kpi"><span>Payouts</span><b>{stats.pendingPayouts || 0}</b></div>
    </div>
    <div className="chips">
      {tabs.map(([k, label]) => (
        <button key={k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => { setTab(k); setQ(''); }}>{label}</button>
      ))}
    </div>
    <div className="chips" style={{ marginBottom: 10 }}>
      <input placeholder="Search this tab…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
    </div>

    {tab === 'overview' && (
      <div className="two-col">
        <div className="panel">
          <h3>Needs attention</h3>
          <p>Pending developer requests: <b>{d.devRequests.length}</b></p>
          <p>Pending payout requests: <b>{stats.pendingPayouts || 0}</b></p>
          <p>Orders waiting to ship: <b>{toShip}</b></p>
          <p>Delisted games: <b>{d.games.filter((g) => g.status === 'delisted').length}</b></p>
          <p>Low-stock toys: <b>{d.toys.filter((t) => (t.stock || 0) <= 3).length}</b></p>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="ghost-btn sm" onClick={() => setTab('devs')}>Review developers</button>
            <button className="ghost-btn sm" onClick={() => setTab('orders')}>Fulfil orders</button>
          </div>
        </div>
        <div className="panel">
          <h3>Recent orders</h3>
          {d.orders.slice(0, 5).map((o) => (
            <p key={o._id} className="tiny">
              <Link to={'/orders/' + o._id}>#{String(o._id).slice(-6).toUpperCase()}</Link>
              {' · '}@{o.user?.username || '?'} · ${Number(o.grandTotal || 0).toFixed(2)} · {o.status}
            </p>
          ))}
          {!d.orders.length && <p className="muted">No orders yet.</p>}
        </div>
      </div>
    )}

    {tab === 'users' && <AdminUsers users={d.users} games={d.games} q={q} onChanged={load} />}
    {tab === 'games' && <AdminGames games={d.games} q={q} onChanged={load} />}
    {tab === 'toys' && <AdminToys toys={d.toys} q={q} onChanged={load} />}
    {tab === 'orders' && <AdminOrders orders={d.orders} q={q} onChanged={load} />}
    {tab === 'payments' && <AdminPayments payments={d.payments} q={q} />}
    {tab === 'payouts' && <AdminPayouts payouts={d.payouts} onChanged={load} />}
    {['devs', 'posts', 'reviews'].includes(tab) && (
      <AdminModeration tab={tab} devRequests={d.devRequests} posts={d.posts} reviews={d.reviews} onChanged={load} />
    )}
  </>);
}
