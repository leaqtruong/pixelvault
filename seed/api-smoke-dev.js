const B = 'http://127.0.0.1:3000';
let ck = '';
async function j(u, o = {}) {
  const r = await fetch(B + u, { headers: { 'Content-Type': 'application/json', Cookie: ck }, ...o });
  const sc = r.headers.get('set-cookie');
  if (sc) ck = sc.split(';')[0];
  return { s: r.status, d: await r.json().catch(() => ({})) };
}
(async () => {
  // dev login
  let r = await j('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'dev@neonforge.gg', password: 'password123' }) });
  console.log('DEV_LOGIN', r.s, r.d.user.role);
  // dev edit own game price
  const dev = await j('/api/dev');
  const g = dev.d.games[0];
  r = await j('/api/dev/' + g._id + '/edit', { method: 'POST', body: JSON.stringify({ price: g.price, discountPct: g.discountPct, status: 'published' }) });
  console.log('DEV_EDIT', r.s);
  // mod upload via slug
  const gl = await j('/api/games?limit=1');
  r = await j('/api/mods/new', { method: 'POST', body: JSON.stringify({ game: gl.d.games[0].slug, title: 'SMOKE-TEST-MOD-DELETE-ME', description: 'x' }) });
  console.log('MOD_UPLOAD', r.s, r.d.id || r.d.error);
  // mature filter
  await j('/api/auth/logout', { method: 'POST' });
  r = await j('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'gamer@vault.gg', password: 'password123' }) });
  await j('/api/users/me', { method: 'POST', body: JSON.stringify({ matureFilter: true }) });
  r = await j('/api/games?limit=60');
  const hasM = r.d.games.some((x) => x.rating === 'M');
  console.log('MATURE_FILTERED_OUT=' + !hasM, 'total=' + r.d.total);
  await j('/api/users/me', { method: 'POST', body: JSON.stringify({ matureFilter: false }) });
  // cleanup test mod
  const mods = await j('/api/mods');
  const tm = (mods.d.mods || []).find((m) => m.title === 'SMOKE-TEST-MOD-DELETE-ME');
  console.log('MOD_VISIBLE=' + !!tm);
})();
