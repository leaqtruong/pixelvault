import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../components.jsx';

export function AdminOrders({ orders, q, onChanged }) {
  const [manageOrder, setManageOrder] = useState(null);
  const toast = useToast();
  const ql = q.trim().toLowerCase();
  const rows = !ql ? orders : orders.filter((o) => String(o._id).toLowerCase().includes(ql) || (o.user?.username || '').toLowerCase().includes(ql));
  const advance = async (o) => {
    try { const r = await api('/admin/orders/' + o._id + '/advance', { method: 'POST' }); toast('Shipment ' + r.shipment.status); onChanged(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const refund = async (o) => {
    if (!window.confirm(`Refund order #${String(o._id).slice(-6).toUpperCase()}? Keys will be revoked and stock restored.`)) return;
    try { await api(`/admin/orders/${o._id}/refund`, { method: 'POST' }); toast('Order refunded'); onChanged(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const saveTracking = async (e, o) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try { await api(`/admin/orders/${o._id}/tracking`, { method: 'POST', body: { carrier: f.get('carrier'), tracking: f.get('tracking') } }); toast('Tracking saved'); onChanged(); }
    catch (er) { toast(er.message, 'err'); }
  };
  const exportCsv = () => {
    const header = ['Order', 'Buyer', 'Status', 'Total', 'Placed'];
    const lines = rows.map((o) => [o._id, o.user?.username || '', o.status, Number(o.grandTotal || 0).toFixed(2), new Date(o.createdAt).toISOString()]);
    const csv = [header, ...lines].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'pixelvault-orders.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const current = manageOrder ? (orders.find((o) => o._id === manageOrder._id) || manageOrder) : null;
  return (<>
    <div className="chips" style={{ marginBottom: 10 }}>
      <button className="ghost-btn sm" onClick={exportCsv}>Export CSV</button>
    </div>
    {current && (
      <form className="panel" onSubmit={(e) => saveTracking(e, current)} style={{ marginBottom: 12 }}>
        <div className="sec-head" style={{ marginTop: 0 }}>
          <span className="ix">Order</span>
          <h2>#{String(current._id).slice(-6).toUpperCase()}</h2>
          <button type="button" className="ghost-btn sm" style={{ marginLeft: 'auto' }} onClick={() => setManageOrder(null)}>Close</button>
        </div>
        <p className="tiny">@{current.user?.username || '?'} · {current.status} · ${Number(current.grandTotal || 0).toFixed(2)}</p>
        {current.shipment?.address ? (
          <p className="tiny">
            <b>Ship to:</b> {current.shipment.address.fullName}, {current.shipment.address.street}, {current.shipment.address.city} {current.shipment.address.region} {current.shipment.address.postal}, {current.shipment.address.country} · {current.shipment.address.phone}
          </p>
        ) : <p className="tiny">Digital order — no shipping address.</p>}
        {current.shipment && (
          <div className="row">
            <input name="carrier" defaultValue={current.shipment.carrier || ''} placeholder="Carrier (GHN, ViettelPost…)" />
            <input name="tracking" defaultValue={current.shipment.tracking || ''} placeholder="Tracking number" />
            <button className="cta-btn sm">Save tracking</button>
          </div>
        )}
      </form>
    )}
    {rows.length ? (
      <table className="ptable">
        <thead><tr><th>Order</th><th>Buyer</th><th>Placed</th><th>Units</th><th>Status</th><th>Shipment</th><th>Total</th><th /></tr></thead>
        <tbody>{rows.map((o) => {
          const st = o.shipment?.status;
          const label = st === 'packing' ? 'Mark shipped' : st === 'shipped' ? 'Mark delivered' : null;
          return (
            <tr key={o._id}>
              <td><Link className="t-name" to={'/orders/' + o._id}>#{String(o._id).slice(-6).toUpperCase()}</Link></td>
              <td className="t-genre">@{o.user?.username || '?'}</td>
              <td className="t-genre">{new Date(o.createdAt).toLocaleDateString()}</td>
              <td className="t-genre">{(o.items || []).reduce((s, i) => s + i.qty, 0)}</td>
              <td className="t-keys">{o.status}</td>
              <td className="t-genre">{st || 'digital'}</td>
              <td className="t-now">${Number(o.grandTotal || 0).toFixed(2)}</td>
              <td>
                <div className="row" style={{ gap: 4 }}>
                  <button className="ghost-btn sm" onClick={() => setManageOrder(o)}>Details</button>
                  {label ? <button className="ghost-btn sm" onClick={() => advance(o)}>{label}</button> : null}
                  {['paid', 'fulfilled', 'partially_shipped', 'shipped', 'delivered'].includes(o.status) && (
                    <button className="ghost-btn sm" onClick={() => refund(o)}>Refund</button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}</tbody>
      </table>
    ) : <div className="empty"><h3>No orders yet</h3><p>Paid orders appear here for fulfilment.</p></div>}
  </>);
}
