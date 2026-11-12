import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components.jsx';

export function AdminUserPanel({ userId, games, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [grantId, setGrantId] = useState('');
  const toast = useToast();
  const load = () => api(`/admin/users/${userId}`).then(setD).catch(() => setD({ err: 1 }));
  useEffect(() => { load(); }, [userId]);
  if (!d) return <p className="muted">Loading user…</p>;
  if (d.err) return <p className="err">User not found.</p>;
  const u = d.user;
  const act = async (path, body) => {
    try { await api(path, { method: 'POST', body }); toast('Saved'); load(); onChanged(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const del = async () => {
    if (!window.confirm(`Delete @${u.username}? Their posts and reviews are removed too.`)) return;
    try { await api(`/admin/users/${u._id}`, { method: 'DELETE' }); onClose(); onChanged(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const reset = async () => {
    const pw = window.prompt(`New password for @${u.username} (at least 6 characters):`);
    if (!pw) return;
    act(`/admin/users/${u._id}/password`, { password: pw });
  };
  const grant = async () => {
    if (!grantId) return;
    await act(`/admin/users/${u._id}/grant-game`, { gameId: grantId });
    setGrantId('');
  };
  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div className="sec-head" style={{ marginTop: 0 }}>
        <span className="ix">User</span>
        <h2>@{u.username}</h2>
        <button className="ghost-btn sm" style={{ marginLeft: 'auto' }} onClick={onClose}>Close</button>
      </div>
      <p className="tiny">{u.email} · joined {new Date(u.createdAt).toLocaleDateString()} · {u.isBanned ? 'SUSPENDED' : 'active'} · {u.role}</p>
      <div className="kpi-row">
        <div className="kpi"><span>Orders</span><b>{d.orders.length}</b></div>
        <div className="kpi"><span>Lifetime spend</span><b>${Number(d.spent || 0).toFixed(2)}</b></div>
        <div className="kpi"><span>Library</span><b>{(u.library || []).length}</b></div>
        <div className="kpi"><span>Wishlist</span><b>{(u.wishlist || []).length + (u.toyWishlist || []).length}</b></div>
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={u.role} onChange={(e) => act(`/admin/users/${u._id}/role`, { role: e.target.value })}>
          <option value="user">user</option>
          <option value="developer">developer</option>
          <option value="admin">admin</option>
        </select>
        <button className="ghost-btn sm" onClick={() => act(`/admin/users/${u._id}/ban`)}>{u.isBanned ? 'Unban' : 'Ban'}</button>
        <button className="ghost-btn sm" onClick={reset}>Reset password</button>
        <button className="ghost-btn sm" onClick={del}>Delete account</button>
      </div>
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={grantId} onChange={(e) => setGrantId(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">Grant game…</option>
          {games.map((g) => <option key={g._id} value={g._id}>{g.title}</option>)}
        </select>
        <button className="cta-btn sm" onClick={grant} disabled={!grantId}>Grant game</button>
      </div>
      <h3>Library ({(u.library || []).length})</h3>
      <p className="tiny">{(u.library || []).map((e) => e.game?.title).filter(Boolean).join(' · ') || 'No games yet.'}</p>
      <h3>Recent orders</h3>
      {d.orders.slice(0, 8).map((o) => <p key={o._id} className="tiny">#{String(o._id).slice(-6).toUpperCase()} · {o.status} · ${Number(o.grandTotal || 0).toFixed(2)}</p>)}
      {!d.orders.length && <p className="muted">No orders.</p>}
    </div>
  );
}
