import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';

export function DevSales() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/dev').then(setD).catch(() => setD({ err: 1 })); }, []);
  if (!d) return <p className="muted">Loading…</p>;
  if (d.err) return <p className="muted">Developer account required. <Link to="/dev/apply">Become a developer</Link></p>;
  const download = () => {
    const lines = ['month,gross_usd', ...d.monthly.map(([m, v]) => `${m},${Number(v).toFixed(2)}`)];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pixelvault-sales.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (<>
    <h1>Sales report <Link className="ghost-btn sm" to="/dev">← Dev console</Link></h1>
    <div className="stat-row">
      <div>Gross<b>${d.gross.toFixed(2)}</b></div>
      <div>You earned (70%)<b>${d.devCut.toFixed(2)}</b></div>
      <div>Digital units<b>{d.unitsD}</b></div>
      <div>Physical units<b>{d.unitsP}</b></div>
      <div>Titles<b>{d.games.length}</b></div>
    </div>
    <div className="panel"><h3>Revenue by month</h3>
      {d.monthly.length ? <table className="tbl"><tbody>
        {d.monthly.map(([m, v]) => <tr key={m}><td>{m}</td><td>${Number(v).toFixed(2)}</td></tr>)}
      </tbody></table> : <p className="muted">No paid orders recorded yet.</p>}
      {!!d.monthly.length && <button className="ghost-btn" style={{ marginTop: 12 }} onClick={download}>Download CSV</button>}
    </div>
    <div className="panel"><h3>By region</h3>
      {Object.keys(d.byCountry || {}).length ? <table className="tbl"><tbody>
        {Object.entries(d.byCountry).map(([c, n]) => <tr key={c}><td>{c === 'DIGITAL' ? 'Digital only' : c}</td><td>{n} orders</td></tr>)}
      </tbody></table> : <p className="muted">Nothing yet.</p>}
    </div>
  </>);
}

