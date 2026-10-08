const B = 'http://127.0.0.1:3000';
let ck = '';
async function j(u, o = {}) {
  const r = await fetch(B + u, { headers: { 'Content-Type': 'application/json', Cookie: ck }, ...o });
  const sc = r.headers.get('set-cookie');
  if (sc) ck = sc.split(';')[0];
  return { s: r.status, d: await r.json().catch(() => ({})) };
}
(async () => {
  let r = await j('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'gamer@vault.gg', password: 'password123' }) });
  console.log('LOGIN', r.s);
  r = await j('/api/toys?limit=3');
  const t = r.d.toys[0];
  console.log('TOY', t.title, t.price, 'stock=' + t.stock);
  r = await j('/api/cart/add', { method: 'POST', body: JSON.stringify({ toyId: t._id }) });
  console.log('ADD', r.s, r.d.error || 'ok');
  r = await j('/api/checkout/place', { method: 'POST', body: JSON.stringify({ fullName: 'Test User', street: '1 Main St', city: 'HCMC', postal: '70000' }) });
  console.log('PLACE', r.s, r.d.orderId || r.d.error);
  if (r.d.orderId) {
    const o = await j('/api/orders/' + r.d.orderId);
    console.log('SHIPMENT', o.d.order.shipment.tracking, o.d.order.shipment.status);
    const l = await j('/api/library');
    console.log('TOYLIB', l.d.user.toyLibrary.length);
  }
})();
