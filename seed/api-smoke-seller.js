const B = 'http://127.0.0.1:3000';
let ck = '';
async function j(u, o = {}) {
  const r = await fetch(B + u, { headers: { 'Content-Type': 'application/json', Cookie: ck }, ...o });
  const sc = r.headers.get('set-cookie');
  if (sc) ck = sc.split(';')[0];
  return { s: r.status, d: await r.json().catch(() => ({})) };
}
(async () => {
  let r = await j('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'dev@neonforge.gg', password: 'password123' }) });
  console.log('DEV_LOGIN', r.s, r.d.user && r.d.user.role);
  r = await j('/api/dev');
  const g = r.d.games[0];
  console.log('DEV_DASH games=' + r.d.games.length, 'gross=' + r.d.gross.toFixed(2), 'unitsD=' + r.d.unitsD, 'unitsP=' + r.d.unitsP);
  // key list (masked)
  r = await j('/api/dev/' + g._id + '/keys/list?limit=3');
  console.log('KEY_LIST', r.s, 'count=' + (r.d.keys || []).length, 'mask=' + (r.d.keys[0] || {}).mask);
  // revoke one available key
  const avail = (r.d.keys || []).find((k) => k.status === 'available');
  if (avail) {
    const rev = await j(`/api/dev/${g._id}/keys/${avail._id}/revoke`, { method: 'POST' });
    console.log('REVOKE', rev.s, rev.d.error || 'ok');
  }
  // revoke twice must be safe
  if (avail) {
    const rev2 = await j(`/api/dev/${g._id}/keys/${avail._id}/revoke`, { method: 'POST' });
    console.log('REVOKE_AGAIN', rev2.s, rev2.d.error || 'ok');
  }
  // toy restock with price
  r = await j('/api/dev/toys');
  const t = r.d.toys[0];
  const rs = await j(`/api/dev/toys/${t._id}/restock`, { method: 'POST', body: JSON.stringify({ stock: t.stock, price: t.price }) });
  console.log('TOY_RESTOCK', rs.s, rs.d.error || 'ok');
  // restore key stock that revoke consumed
  r = await j('/api/dev/' + g._id + '/keys/generate', { method: 'POST', body: JSON.stringify({ count: 1 }) });
  console.log('REGEN', r.s, r.d.added);
  r = await j('/api/stats');
  console.log('STATS', r.d);
})();
