/* Sessions must outlive the process — that is the whole reason for moving off
   MemoryStore. This signs in, confirms the session row is in MongoDB, kills
   the server, starts it again, and confirms the same cookie still works. */
require('dotenv').config();
const mongoose = require('mongoose');
const { execFileSync, spawn } = require('node:child_process');
const net = require('node:net');

const B = 'http://127.0.0.1:3000';
let cookie = '';
let bad = 0;
const ok = (n, c, x = '') => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

async function call(path, method = 'GET', body) {
  const res = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) cookie = c.split(';')[0];
  const t = await res.text();
  try { return { status: res.status, data: JSON.parse(t) }; } catch { return { status: res.status, data: t }; }
}

const portOpen = () => new Promise((res) => {
  const s = net.connect({ host: '127.0.0.1', port: 3000 }, () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  s.on('timeout', () => { s.destroy(); res(false); });
});

const waitPort = async (want, ms = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await portOpen() === want) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};

const killServers = () => {
  try {
    execFileSync('powershell', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }",
    ], { stdio: 'ignore' });
  } catch {}
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  killServers();
  await waitPort(false, 15000);
  const child = spawn('node', ['server.js'], { cwd: process.cwd(), detached: true, stdio: 'ignore' });
  child.unref();
  const up = await waitPort(true, 40000);
  ok('server started', up);

  const sessionsCol = db.collection('sessions');
  await sessionsCol.deleteMany({});

  const login = await call('/api/auth/login', 'POST', { email: 'gamer@vault.gg', password: 'password123' });
  ok('signed in', login.status === 200 && !!login.data.user, login.data.user && login.data.user.username);
  ok('a session cookie was issued', cookie.startsWith('connect.sid='), cookie.slice(0, 28) + '…');

  const rows = await sessionsCol.find({}).toArray();
  ok('session row exists in MongoDB', rows.length === 1, rows.length + ' row(s) in the sessions collection');
  ok('the row carries the signed-in user', rows[0] && rows[0].sess && rows[0].sess.user && rows[0].sess.user.username === 'vaultdweller',
    rows[0] && rows[0].sess.user && rows[0].sess.user.username);
  ok('an expiry is stored for automatic cleanup', rows[0] && rows[0].expiresAt > new Date());

  // the decisive check: restart the process, reuse the same cookie
  killServers();
  await waitPort(false, 15000);
  const child2 = spawn('node', ['server.js'], { cwd: process.cwd(), detached: true, stdio: 'ignore' });
  child2.unref();
  const up2 = await waitPort(true, 40000);
  ok('server restarted', up2);

  const me = await call('/api/auth/me');
  ok('the same cookie still identifies the user after a restart', !!me.data.user,
    me.data.user ? me.data.user.username : JSON.stringify(me.data).slice(0, 60));

  const cart = await call('/api/cart');
  ok('session middleware works, not just the login route', cart.status === 200);

  console.log('\n  sessions stored: ' + await sessionsCol.countDocuments({}) + ' (a fresh process reads them back)');
  await mongoose.disconnect();
  console.log(bad ? '\n' + bad + ' FAILURES' : '\nsessions live in MongoDB and survive a process restart');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('crashed:', e); process.exit(1); });