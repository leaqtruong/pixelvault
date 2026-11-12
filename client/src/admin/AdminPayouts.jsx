import { api } from '../api.js';
import { useToast } from '../components.jsx';

export function AdminPayouts({ payouts, onChanged }) {
  const toast = useToast();
  const pay = async (p) => {
    try { await api(`/admin/payouts/${p._id}/pay`, { method: 'POST' }); toast('Payout marked paid'); onChanged(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const reject = async (p) => {
    if (!window.confirm(`Reject payout of $${Number(p.amount || 0).toFixed(2)}?`)) return;
    try { await api(`/admin/payouts/${p._id}/reject`, { method: 'POST' }); toast('Payout rejected'); onChanged(); }
    catch (e) { toast(e.message, 'err'); }
  };
  if (!payouts.length) return <p className="muted">No payout requests.</p>;
  return (
    <table className="ptable">
      <thead><tr><th>Developer</th><th>Amount</th><th>Status</th><th>Requested</th><th>Note</th><th /></tr></thead>
      <tbody>{payouts.map((p) => (
        <tr key={p._id}>
          <td className="t-name">@{p.developer?.username || '?'}</td>
          <td className="t-now">${Number(p.amount || 0).toFixed(2)}</td>
          <td className="t-keys">{p.status}</td>
          <td className="t-genre">{new Date(p.requestedAt).toLocaleDateString()}</td>
          <td className="t-genre">{p.note || '—'}</td>
          <td>
            {p.status === 'pending' && (
              <div className="row" style={{ gap: 4 }}>
                <button className="cta-btn sm" onClick={() => pay(p)}>Mark paid</button>
                <button className="ghost-btn sm" onClick={() => reject(p)}>Reject</button>
              </div>
            )}
          </td>
        </tr>
      ))}</tbody>
    </table>
  );
}
