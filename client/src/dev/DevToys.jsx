import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';

export function DevToys() {
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(null);
  const toast = useToast();
  useEffect(() => { api('/dev/toys').then(setD).catch(() => setD({ toys: [] })); }, []);
  const save = async (id, price, stock) => {
    try { await api(`/dev/toys/${id}/restock`, { method: 'POST', body: { stock, price } }); setD(await api('/dev/toys')); toast('Saved'); }
    catch (er) { toast(er.message, 'err'); }
  };
  if (!d) return <p className="muted">Loading…</p>;
  const low = d.toys.filter((t) => (t.stock || 0) <= 3);
  const totalRev = d.toys.reduce((s, t) => s + (t.stats.revenueGross || 0), 0);
  const totalUnits = d.toys.reduce((s, t) => s + (t.stats.unitsSold || 0), 0);
  return (<>
    <h1>Toy shelf <Link className="ghost-btn sm" to="/dev">← Dev console</Link></h1>
    {!!low.length && <div className="alert-bar"><div className="alert-warn"><b>{low.length} collectible{low.length > 1 ? 's' : ''} nearly sold out</b> — 3 or fewer left.</div></div>}
    <div className="kpi-row">
      <div className="kpi"><span>Listings</span><b>{d.toys.length}</b></div>
      <div className="kpi"><span>Units sold</span><b>{totalUnits}</b></div>
      <div className="kpi"><span>Gross revenue</span><b>${totalRev.toFixed(2)}</b></div>
    </div>
    <div className="panel"><table className="tbl"><tbody>
      <tr><th>Collectible</th><th>Price</th><th>Stock</th><th>Sold</th><th>Revenue</th><th></th></tr>
      {d.toys.map((t) => (
        <tr key={t._id}>
          <td><Link to={`/toys/${t.slug}`}>{t.title}</Link><br /><span className="tiny">{t.brand}</span></td>
          <td>${t.price.toFixed(2)}</td>
          <td>{t.stock}</td>
          <td>{t.stats.unitsSold}</td>
          <td>${(t.stats.revenueGross || 0).toFixed(2)}</td>
          <td><button className="ghost-btn sm" onClick={() => setEdit(edit === t._id ? null : t._id)}>Edit</button></td>
        </tr>
      ))}
      {edit && <tr><td colSpan="6">
        <EditToy t={d.toys.find((x) => x._id === edit)} onSave={save} onDone={() => setEdit(null)} />
      </td></tr>}
    </tbody></table></div>
  </>);
}

function EditToy({ t, onSave, onDone }) {
  if (!t) return null;
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.target); onSave(t._id, f.get('price'), f.get('stock')); onDone(); }}>
      <input name="price" type="number" step="0.01" defaultValue={t.price} title="Price" />
      <input name="stock" type="number" defaultValue={t.stock} title="Stock" />
      <button className="cta-btn sm">Save</button>
      <button type="button" className="ghost-btn sm" onClick={onDone}>Cancel</button>
    </form>
  );
}

