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
  console.log('LOGIN', r.s, JSON.stringify(r.d.user));
  r = await j('/api/games?limit=5');
  const g = r.d.games.find((x) => x.price > 0);
  console.log('GAME', g.title);
  r = await j('/api/cart/add', { method: 'POST', body: JSON.stringify({ gameId: g._id }) });
  console.log('ADD', r.s);
  r = await j('/api/cart');
  console.log('CART', r.d.items.length, r.d.subtotal);
  r = await j('/api/checkout/place', { method: 'POST', body: JSON.stringify({}) });
  console.log('PLACE', r.s, r.d.orderId || r.d.error);
  if (r.d.orderId) {
    const o = await j('/api/orders/' + r.d.orderId);
    console.log('ORDER_ITEMS', o.d.order.items.length, 'KEYS=', Object.keys(o.d.plainById).length);
  }
})();
