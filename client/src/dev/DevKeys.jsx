import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import { useToast, ImageUpload } from '../components.jsx';

export function DevKeys() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState('');
  const [rows, setRows] = useState([]);
  const toast = useToast();
  const load = () => api('/dev/' + id + '/keys').then(setD).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (id) api('/dev/' + id + '/keys/list?limit=8').then((r) => setRows(r.keys || [])).catch(() => {});
  }, [id, d]);
  const revoke = async (gid) => {
    try { await api(`/dev/${id}/keys/${gid}/revoke`, { method: 'POST' }); toast('Key revoked'); load(); }
    catch (er) { toast(er.message, 'err'); }
  };
  if (!d) return <p className="muted">{msg || 'Loading…'}</p>;
  return (<>
    <h1>Issued keys — {d.game.title}</h1>
    <div className="alert-bar"><div className={d.supplier ? 'alert-warn' : ''}><b>Keys are not stocked.</b> {' '}
      {d.supplier
        ? 'Each paid order fetches a key from your publisher endpoint.'
        : 'No publisher endpoint is configured, so each paid order issues a DEMO placeholder.'}
      {' '}This page shows what has already been issued, and lets you revoke one that leaks.
    </div></div>
    <div className="kpi-row">
      <div className="kpi"><span>Issued</span><b>{d.sold}</b></div>
      <div className="kpi"><span>Revoked</span><b>{d.revoked}</b></div>
      <div className="kpi"><span>Source</span><b>{d.supplier ? 'Publisher' : 'DEMO'}</b></div>
    </div>
    {!!rows.length && <div className="panel"><h3>Recently issued (masked)</h3>
      <table className="tbl"><tbody>
        <tr><th>Key</th><th>Status</th><th>Source</th><th>Platform</th><th></th></tr>
        {rows.map((k) => <tr key={k._id}>
          <td className="tiny"><code>{k.mask}</code></td><td>{k.status}</td><td className="tiny">{k.source}</td><td className="tiny">{k.platform}</td>
          {k.status === 'sold' && <td><button className="ghost-btn sm" onClick={() => revoke(k._id)}>Revoke</button></td>}
        </tr>)}
      </tbody></table></div>}
  </>);
}

