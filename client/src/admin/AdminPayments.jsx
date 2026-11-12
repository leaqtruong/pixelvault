export function AdminPayments({ payments, q }) {
  const ql = q.trim().toLowerCase();
  const rows = !ql ? payments : payments.filter((p) => p.orderId.toLowerCase().includes(ql) || (p.user?.username || '').toLowerCase().includes(ql));
  return (
    <table className="ptable">
      <thead><tr><th>Reference</th><th>Buyer</th><th>Amount</th><th>Provider</th><th>Status</th><th>Created</th></tr></thead>
      <tbody>{rows.map((p) => (
        <tr key={p._id}>
          <td className="t-name">{p.orderId}</td>
          <td className="t-genre">@{p.user?.username || '?'}</td>
          <td className="t-now">{new Intl.NumberFormat('vi-VN').format(p.amount || 0)} ₫</td>
          <td className="t-genre">{p.provider}{p.live ? ' · live' : ' · sandbox'}</td>
          <td className="t-keys">{p.status}</td>
          <td className="t-genre">{new Date(p.createdAt).toLocaleDateString()}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}
