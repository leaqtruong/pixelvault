import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components.jsx';

export function AdminGenres({ q = '' }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const toast = useToast();
  const load = () => api('/admin/genres')
    .then((r) => { setRows(r.genres || []); setErr(''); })
    .catch((e) => { setErr(e.message); setRows([]); });
  useEffect(() => { load(); }, []);
  if (err) return <p className="err">{err}</p>;
  if (!rows) return <p className="muted">Loading genres…</p>;

  const filtered = q.trim()
    ? rows.filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase()) || g.slug.includes(q.trim().toLowerCase()))
    : rows;

  const create = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/admin/genres', { method: 'POST', body: { name: f.get('name'), sortOrder: f.get('sortOrder') } });
      e.target.reset();
      toast('Genre created');
      load();
    } catch (er) { toast(er.message, 'err'); }
  };

  const patch = async (g, body) => {
    try {
      await api('/admin/genres/' + g._id, { method: 'POST', body });
      toast('Saved');
      load();
    } catch (e) { toast(e.message, 'err'); }
  };

  const rename = (g) => {
    const name = window.prompt('New genre name', g.name);
    if (name && name.trim() && name.trim() !== g.name) patch(g, { name: name.trim() });
  };

  return (
    <>
      <form className="panel" onSubmit={create} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <h3>Create genre</h3>
        <div className="row">
          <input name="name" placeholder="Name (e.g. Metroidvania)" required />
          <input name="sortOrder" type="number" placeholder="Sort order" defaultValue="0" />
          <button className="cta-btn sm">Create</button>
        </div>
      </form>
      <table className="ptable">
        <thead><tr><th>Genre</th><th>Slug</th><th>Games</th><th>Order</th><th>Active</th><th /></tr></thead>
        <tbody>{filtered.map((g) => (
          <tr key={g._id}>
            <td className="t-name">{g.name}</td>
            <td className="t-genre mono">{g.slug}</td>
            <td className="t-genre">{g.count || 0}</td>
            <td className="t-genre">{g.sortOrder}</td>
            <td className="t-genre">{g.active ? 'yes' : 'hidden'}</td>
            <td>
              <button className="ghost-btn sm" onClick={() => rename(g)}>Rename</button>{' '}
              <button className="ghost-btn sm" onClick={() => patch(g, { active: !g.active })}>
                {g.active ? 'Hide' : 'Show'}
              </button>
            </td>
          </tr>
        ))}</tbody>
      </table>
      {!filtered.length && <p className="muted">No genres match.</p>}
    </>
  );
}
