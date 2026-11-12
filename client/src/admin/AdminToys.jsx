import { useState } from 'react';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';
import { AdminToyPanel } from './AdminToyPanel.jsx';

export function AdminToys({ toys, q, onChanged }) {
  const [newToyOpen, setNewToyOpen] = useState(false);
  const [manageToy, setManageToy] = useState(null);
  const toast = useToast();
  const ql = q.trim().toLowerCase();
  const rows = !ql ? toys : toys.filter((t) => [t.title, t.brand, t.category].some((v) => String(v || '').toLowerCase().includes(ql)));
  const createToy = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/admin/toys', { method: 'POST', body: { title: f.get('title'), brand: f.get('brand'), category: f.get('category'), price: f.get('price'), stock: f.get('stock'), coverImage: f.get('coverImage') } });
      toast('Toy created'); setNewToyOpen(false); onChanged();
    } catch (er) { toast(er.message, 'err'); }
  };
  return (<>
    <div className="chips" style={{ marginBottom: 10 }}>
      <button className="cta-btn sm" onClick={() => setNewToyOpen(!newToyOpen)}>+ New toy</button>
    </div>
    {newToyOpen && (
      <form className="panel" onSubmit={createToy} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
        <h3>New collectible</h3>
        <input name="title" placeholder="Title" required />
        <div className="row">
          <input name="brand" placeholder="Brand" />
          <select name="category">{['Plush', 'Figure', 'Statue', 'Apparel', 'Book', 'Music', 'Pins', 'Other'].map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <div className="row"><input name="price" type="number" step="0.01" placeholder="Price" required /><input name="stock" type="number" placeholder="Stock" /></div>
        <ImageUpload name="coverImage" kind="cover" label="Upload cover" />
        <div className="row"><button className="cta-btn sm">Create toy</button><button type="button" className="ghost-btn sm" onClick={() => setNewToyOpen(false)}>Cancel</button></div>
      </form>
    )}
    {manageToy && <AdminToyPanel toyId={manageToy._id} onClose={() => setManageToy(null)} onChanged={onChanged} />}
    <table className="ptable">
      <thead><tr><th>Toy</th><th>Brand</th><th>Category</th><th>Price</th><th>Stock</th><th>Sold</th><th>Revenue</th><th /></tr></thead>
      <tbody>{rows.map((t) => (
        <tr key={t._id}>
          <td className="t-name">{t.title}</td>
          <td className="t-genre">{t.brand}</td>
          <td className="t-genre">{t.category}</td>
          <td className="t-now">${Number(t.price || 0).toFixed(2)}</td>
          <td className="t-genre">{t.stock}</td>
          <td className="t-genre">{t.stats?.unitsSold || 0}</td>
          <td className="t-now">${Number(t.stats?.revenueGross || 0).toFixed(2)}</td>
          <td><button className="ghost-btn sm" onClick={() => setManageToy(t)}>Open</button></td>
        </tr>
      ))}</tbody>
    </table>
  </>);
}
