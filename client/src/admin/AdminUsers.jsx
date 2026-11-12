import { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components.jsx';
import { AdminUserPanel } from './AdminUserPanel.jsx';

export function AdminUsers({ users, games, q, onChanged }) {
  const [manageUser, setManageUser] = useState(null);
  const toast = useToast();
  const ql = q.trim().toLowerCase();
  const rows = !ql ? users : users.filter((u) => u.username.toLowerCase().includes(ql) || u.email.toLowerCase().includes(ql));
  const createUser = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/admin/users', { method: 'POST', body: { username: f.get('username'), email: f.get('email'), password: f.get('password'), role: f.get('role') } });
      e.target.reset(); toast('Account created'); onChanged();
    } catch (er) { toast(er.message, 'err'); }
  };
  return (<>
    <form className="panel" onSubmit={createUser} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
      <h3>Create account</h3>
      <div className="row"><input name="username" placeholder="Username" required /><input name="email" type="email" placeholder="Email" required /></div>
      <div className="row">
        <input name="password" type="password" placeholder="Password" required />
        <select name="role"><option value="user">user</option><option value="developer">developer</option><option value="admin">admin</option></select>
      </div>
      <button className="cta-btn sm">Create account</button>
    </form>
    {manageUser && <AdminUserPanel userId={manageUser._id} games={games} onClose={() => setManageUser(null)} onChanged={onChanged} />}
    <table className="ptable">
      <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Orders</th><th>Spent</th><th>Joined</th><th /></tr></thead>
      <tbody>{rows.map((u) => (
        <tr key={u._id}>
          <td className="t-name">@{u.username}{u.isBanned ? ' · suspended' : ''}</td>
          <td className="t-genre">{u.email}</td>
          <td className="t-genre">{u.role}</td>
          <td className="t-genre">{u.orders || 0}</td>
          <td className="t-now">${Number(u.spent || 0).toFixed(2)}</td>
          <td className="t-genre">{new Date(u.createdAt).toLocaleDateString()}</td>
          <td><button className="ghost-btn sm" onClick={() => setManageUser(u)}>Open</button></td>
        </tr>
      ))}</tbody>
    </table>
  </>);
}
