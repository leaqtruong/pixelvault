import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';

export function AdminToyPanel({ toyId, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const toast = useToast();
  const load = () => api(`/admin/toys/${toyId}`).then(setD).catch(() => setD({ err: 1 }));
  useEffect(() => { load(); }, [toyId]);
  if (!d) return <p className="muted">Loading toy…</p>;
  if (d.err) return <p className="err">Toy not found.</p>;
  const t = d.toy;
  const save = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api(`/admin/toys/${t._id}`, {
        method: 'POST',
        body: {
          title: f.get('title'), brand: f.get('brand'), category: f.get('category'),
          price: f.get('price'), stock: f.get('stock'), weightLb: f.get('weightLb'),
          description: f.get('description'), coverImage: f.get('coverImage'), status: f.get('status'),
        },
      });
      toast('Toy saved'); load(); onChanged();
    } catch (er) { toast(er.message, 'err'); }
  };
  const del = async () => {
    if (!window.confirm(`Delete "${t.title}" permanently?`)) return;
    try { await api(`/admin/toys/${t._id}`, { method: 'DELETE' }); onClose(); onChanged(); }
    catch (er) { toast(er.message, 'err'); }
  };
  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div className="sec-head" style={{ marginTop: 0 }}>
        <span className="ix">Toy</span>
        <h2>{t.title}</h2>
        <button className="ghost-btn sm" style={{ marginLeft: 'auto' }} onClick={onClose}>Close</button>
      </div>
      <div className="kpi-row">
        <div className="kpi"><span>Price</span><b>${Number(t.price || 0).toFixed(2)}</b></div>
        <div className="kpi"><span>Stock</span><b>{t.stock}</b></div>
        <div className="kpi"><span>Sold</span><b>{t.stats?.unitsSold || 0}</b></div>
        <div className="kpi"><span>Revenue</span><b>${Number(t.stats?.revenueGross || 0).toFixed(2)}</b></div>
      </div>
      <form onSubmit={save} style={{ display: 'grid', gap: 8 }}>
        <input name="title" placeholder="Title" defaultValue={t.title} required />
        <div className="row">
          <input name="brand" placeholder="Brand" defaultValue={t.brand} />
          <select name="category" defaultValue={t.category}>
            {['Plush', 'Figure', 'Statue', 'Apparel', 'Book', 'Music', 'Pins', 'Other'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="row">
          <input name="price" type="number" step="0.01" placeholder="Price" defaultValue={t.price} required />
          <input name="stock" type="number" placeholder="Stock" defaultValue={t.stock} />
          <input name="weightLb" type="number" step="0.1" placeholder="Weight (lb)" defaultValue={t.weightLb} />
        </div>
        <textarea name="description" placeholder="Description" defaultValue={t.description || ''} />
        <ImageUpload name="coverImage" kind="cover" defaultValue={t.coverImage || ''} label="Upload cover" />
        <div className="row">
          <select name="status" defaultValue={t.status}>
            <option value="published">published</option>
            <option value="hidden">hidden</option>
            <option value="soldout">soldout</option>
          </select>
          <button className="cta-btn sm">Save toy</button>
          <button type="button" className="ghost-btn sm" onClick={del}>Delete toy</button>
        </div>
      </form>
      <h3>Recent orders</h3>
      {d.orders.length
        ? d.orders.map((o) => <p key={o._id} className="tiny">#{String(o._id).slice(-6).toUpperCase()} · {o.status} · {new Date(o.createdAt).toLocaleDateString()}</p>)
        : <p className="muted">No orders yet.</p>}
    </div>
  );
}
