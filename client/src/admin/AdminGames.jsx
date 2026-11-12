import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../components.jsx';
import { AdminGameForm } from './AdminGameForm.jsx';

export function AdminGames({ games, q, onChanged }) {
  const [editGame, setEditGame] = useState(null);
  const [newGameOpen, setNewGameOpen] = useState(false);
  const toast = useToast();
  const ql = q.trim().toLowerCase();
  const rows = !ql ? games : games.filter((g) => g.title.toLowerCase().includes(ql) || (g.developer?.username || '').toLowerCase().includes(ql));
  const saveGame = async (e, game) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      title: f.get('title'), price: f.get('price'), discountPct: f.get('discountPct'),
      genres: f.get('genres'), tags: f.get('tags'), description: f.get('description'),
      coverImage: f.get('coverImage'), featured: f.get('featured') === 'on', status: f.get('status'),
    };
    try {
      await api(game ? `/admin/games/${game._id}` : '/admin/games', { method: 'POST', body });
      toast(game ? 'Game updated' : 'Game created');
      setEditGame(null); setNewGameOpen(false); onChanged();
    } catch (er) { toast(er.message, 'err'); }
  };
  const setStatus = async (g, status) => {
    try { await api(`/admin/games/${g._id}/status`, { method: 'POST', body: { status } }); toast(`${g.title} → ${status}`); onChanged(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const del = async (g) => {
    if (!window.confirm(`Delete "${g.title}" permanently? Keys, reviews and forum posts for it will also be removed.`)) return;
    try { await api(`/admin/games/${g._id}`, { method: 'DELETE' }); setEditGame(null); toast('Game deleted'); onChanged(); }
    catch (e) { toast(e.message, 'err'); }
  };
  return (<>
    <div className="chips" style={{ marginBottom: 10 }}>
      <button className="cta-btn sm" onClick={() => { setNewGameOpen(!newGameOpen); setEditGame(null); }}>+ New game</button>
    </div>
    {newGameOpen && <AdminGameForm game={null} onSave={(e) => saveGame(e, null)} onCancel={() => setNewGameOpen(false)} />}
    {editGame && <AdminGameForm game={editGame} onSave={(e) => saveGame(e, editGame)} onCancel={() => setEditGame(null)} />}
    <table className="ptable">
      <thead><tr><th>Game</th><th>Developer</th><th>Price</th><th>Status</th><th>Stats</th><th /></tr></thead>
      <tbody>{rows.map((g) => (
        <tr key={g._id}>
          <td><Link className="t-name" to={'/games/' + g.slug}>{g.title}</Link></td>
          <td className="t-genre">@{g.developer?.username || '?'}</td>
          <td className="t-now">${Number(g.price || 0).toFixed(2)}</td>
          <td>
            <select defaultValue={g.status} onChange={(e) => setStatus(g, e.target.value)} aria-label={`Status for ${g.title}`}>
              <option value="published">published</option>
              <option value="draft">draft</option>
              <option value="delisted">delisted</option>
            </select>
          </td>
          <td className="t-genre">{g.stats?.unitsDigital ?? 0} digital · {g.stats?.unitsPhysical ?? 0} box</td>
          <td>
            <div className="row" style={{ gap: 4 }}>
              <button className="ghost-btn sm" onClick={() => { setEditGame(g); setNewGameOpen(false); }}>Edit</button>
              <button className="ghost-btn sm" onClick={() => del(g)}>Delete</button>
            </div>
          </td>
        </tr>
      ))}</tbody>
    </table>
  </>);
}
