import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../components.jsx';

export function OrderDetail() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const toast = useToast();
  useEffect(() => { api('/orders/' + id).then(setD).catch(() => setD({ err: true })); }, [id]);
  if (!d) return <p className="muted">Loading…</p>;
  if (d.err) return <p className="err">Order not found.</p>;
  const { order, plainById } = d;
  const cancel = async () => {
    try { await api(`/orders/${id}/cancel`, { method: 'POST' }); toast('Order cancelled'); setD(await api('/orders/' + id)); }
    catch (er) { toast(er.message, 'err'); }
  };
  return (
    <><h1>Order #{String(order._id).slice(-6)}</h1>
      <p className="tiny">{new Date(order.createdAt).toLocaleString()} · status: <b>{order.status}</b>
        {order.status === 'pending' && (
          <button className="ghost-btn sm" style={{ marginLeft: 10 }} onClick={cancel}>Cancel order</button>
        )}
      </p>
      <div className="two-col"><div className="panel"><h3>Items</h3>
        {order.items.map((it, ix) => <div key={ix}><p>{it.qty}× {it.title} ({it.edition}) — ${(it.unitPrice * it.qty).toFixed(2)}</p>
          {(it.keyIds || []).map((k) => <p key={k._id}><code>{plainById[k._id]}</code> <span className="tiny">· Game key</span></p>)}
        </div>)}
        <hr /><h3>Total ${order.grandTotal.toFixed(2)}</h3></div>
        <div className="panel"><h3>Shipment</h3>
          {order.shipment ? <><p>Tracking: <code>{order.shipment.tracking}</code></p><p className="tiny">{order.shipment.method} · {order.shipment.status}</p></>
            : <p>Digital order — keys in <Link to="/library">library</Link>.</p>}
        </div></div>
    </>
  );
}

