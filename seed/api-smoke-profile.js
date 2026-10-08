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
  r = await j('/api/users/me', { method: 'POST', body: JSON.stringify({ displayName: 'Vault Dweller', phone: '0901234567', bio: 'RPG enjoyer', favoriteGenres: 'RPG, Indie', matureFilter: false }) });
  console.log('PROFILE_SAVE', r.s);
  r = await j('/api/users/me/addresses', { method: 'POST', body: JSON.stringify({ label: 'Home', fullName: 'Test User', street: '1 Main St', city: 'HCMC', postal: '70000' }) });
  console.log('ADDR_ADD', r.s, 'count=' + (r.d.addresses || []).length);
  const id = (r.d.addresses || []).find((a) => a.street === '1 Main St')._id;
  r = await j('/api/users/me/addresses/' + id, { method: 'DELETE' });
  console.log('ADDR_DEL', r.s, 'count=' + (r.d.addresses || []).length);
  r = await j('/api/users/vaultdweller');
  console.log('PROFILE_GET', r.s, 'displayName=' + r.d.user.displayName, 'phone=' + r.d.user.phone);
  // cleanup test profile edits
  await j('/api/users/me', { method: 'POST', body: JSON.stringify({ displayName: '', phone: '', bio: 'RPG enjoyer. 400h in vault crawlers.' }) });
  console.log('CLEANED');
})();
