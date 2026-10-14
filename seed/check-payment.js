/* End-to-end payment test against the running server over real HTTP.
 *
 * Walks the same sequence a shopper does: sign in, fill the cart, check out,
 * follow the gateway URL, pay, and land back on the store. Then it attacks the
 * flow the way an attacker would and checks that nothing is delivered.
 */
require('dotenv').config();

/* These tests exercise the settlement logic against the local sandbox driver:
 * the fake gateway page, the tampering checks, the redirect home. Pointing them
 * at a store configured for the real VNPay host would send every request to an
 * external service and turn assertions about our own gateway into assertions
 * about theirs.
 *
 * So the suite brings up its own server on a spare port with the merchant
 * credentials stripped. The .env file is untouched, which means the store the
 * developer is browsing keeps paying through VNPay while these run. */
const { spawn } = require('node:child_process');

const PORT = 3101;
const B = `http://127.0.0.1:${PORT}`;

const serverEnv = { ...process.env };
// Empty string, not a deleted key: server.js calls dotenv.config(), which only
// fills in variables that are absent. Removing them would let .env put the
// real merchant credentials straight back, and the suite would end up talking
// to the live gateway again.
for (const k of ['VNP_TMN_CODE', 'VNP_HASH_SECRET', 'VNP_URL']) serverEnv[k] = '';
serverEnv.PORT = String(PORT);
// The sandbox gateway URL defaults to port 3000, which is the developer's own
// store - one that may well be paying through VNPay. Point it at this server.
serverEnv.SANDBOX_GATEWAY_URL = `http://127.0.0.1:${PORT}/sandbox-gateway`;

const server = spawn('node', ['server.js'], { cwd: process.cwd(), env: serverEnv, stdio: 'ignore' });

const serverUp = new Promise((resolve, reject) => {
  const give = setTimeout(() => reject(new Error('test server did not start within 30s')), 30000);
  (async () => {
    for (;;) {
      try { const r = await fetch(B + '/api/health'); if (r.ok) { clearTimeout(give); return resolve(); } } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
});

const mongoose = require('mongoose');

let cookie = '';
let bad = 0;

const ok = (n, c, x = '') => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

async function call(method, path, body) {
  const res = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const setc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of setc) cookie = c.split(';')[0];
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, location: res.headers.get('location') };
}

/* A crash here must not leave the process alive: mongoose keeps its socket
 * open, node never exits, and the shell waits forever. Every exit path closes
 * the connection and exits explicitly. The watchdog is the backstop. */
const watchdog = setTimeout(() => {
  console.error('\nFAIL watchdog: the run did not finish in 150s and was killed');
  process.exit(2);
}, 150000);
watchdog.unref();

const shutdown = async (code) => {
  try { server.kill(); } catch {}
  try { await mongoose.disconnect(); } catch {}
  clearTimeout(watchdog);
  process.exit(code);
};

process.on('unhandledRejection', (e) => {
  console.error('unhandled rejection:', e);
  shutdown(1);
});

(async () => {
  await serverUp;
  ok('test server up in sandbox mode', true, B);
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const Payment = require('../models/Payment');

  const user = await db.collection('users').findOne({ role: { $ne: 'admin' } });
  ok('found a buyer account', !!user, user && user.username);

  // clean slate so repeated runs are comparable
  await db.collection('orders').deleteMany({});
  await db.collection('payments').deleteMany({});
  await db.collection('gamekeys').updateMany({ status: 'sold' },
    { $set: { status: 'available', order: null, user: null, soldAt: null } });

  // sign in
  // the login endpoint takes an email, not a username
const login = await call('POST', '/api/auth/login', { email: user.email, password: 'password123' });
  ok('signed in', login.status === 200 && !!login.data.user,
    'HTTP ' + login.status + ' as ' + (login.data.user ? login.data.user.username : JSON.stringify(login.data)));

  const keysBefore = await db.collection('gamekeys').countDocuments({ status: 'available' });

  // pick a paid game that has stock
  const game = await db.collection('games').findOne({ price: { $gt: 0 }, 'stats.keysAvailable': { $gt: 2 } });
  ok('found a paid game with key stock', !!game, game && `${game.title} $${game.price}`);

  // ---- 1. cart + checkout returns a gateway URL, and nothing is delivered yet
  await call('POST', '/api/cart/add', { gameId: game._id, qty: 1 });
  const sum = await call('GET', '/api/checkout/summary?method=standard');
  ok('checkout summary computed', sum.status === 200, `total $${sum.data.grand}`);

  const placed = await call('POST', '/api/checkout/place', { method: 'standard', country: 'US' });
  ok('checkout returned a payment URL', placed.status === 200 && !!placed.data.paymentUrl,
    placed.data.paymentUrl ? placed.data.paymentUrl.slice(0, 62) + '…' : JSON.stringify(placed.data));

  const orderId = placed.data.orderId;
  const orderAfterPlace = await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(orderId) });
  ok('order created as pending', orderAfterPlace.status === 'pending', orderAfterPlace.status);
  ok('NO key was reserved before payment', orderAfterPlace.items.every((i) => (i.keyIds || []).length === 0),
    'keyIds all empty — abandoning the basket costs nothing');
  const keysAfterPlace = await db.collection('gamekeys').countDocuments({ status: 'available' });
  ok('key inventory untouched at checkout', keysAfterPlace === keysBefore, `${keysAfterPlace} available`);

  const pay = await db.collection('payments').findOne({ order: new mongoose.Types.ObjectId(orderId) });
  ok('payment row created as pending', pay && pay.status === 'pending');
  ok('payment is flagged as not live', pay && pay.live === false, 'provider=' + pay.provider + ' live=' + pay.live);

  // ---- 2. the gateway page loads and the shopper follows it
  const gw = await fetch(placed.data.paymentUrl, { headers: { Cookie: cookie }, redirect: 'manual' });
  const gwHtml = await gw.text();
  ok('gateway page served', gw.status === 200, 'HTTP ' + gw.status);
  ok('gateway shows the amount', gwHtml.includes('Số tiền') || gwHtml.includes('₫'));
  ok('gateway is labelled a simulation', gwHtml.includes('Sandbox'));

  // ---- 3. tamper with the signature: must be refused
  const url = new URL(placed.data.paymentUrl);
  const tampered = new URL(url.toString());
  tampered.searchParams.set('vnp_Amount', '1');           // try to pay 1
  const tamperedRes = await fetch(tampered.toString(), { headers: { Cookie: cookie }, redirect: 'manual' });
  ok('gateway rejects a tampered amount', tamperedRes.status === 400, 'HTTP ' + tamperedRes.status);
  const stillPending = await db.collection('payments').findOne({ _id: pay._id });
  ok('tampered request did not settle anything', stillPending.status === 'pending', stillPending.status);

  // ---- 4. pay for real through the gateway
  // every query parameter is covered by the signature, so the outcome has to
  // travel in a POST body — appending act=ok to the URL would void it
  const confirm = new URL(placed.data.paymentUrl);
  confirm.pathname = '/sandbox-gateway/result';
  const paid = await fetch(confirm.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: 'act=ok&vnp_BankCode=BIDV',
    redirect: 'manual',
  });
  const backTo = paid.headers.get('location');
  ok('gateway redirected back to the store', paid.status === 302 && !!backTo, (backTo || '').slice(0, 60));
  ok('redirected to the SPA return page', String(backTo).includes('/payment/return'));

  // ---- 5. the store verifies the signature and settles
  const ret = await call('GET', backTo.replace(B, '').replace('/payment/return', '/api/payment/return'));
  ok('store accepted the signed callback', ret.data && ret.data.ok === true, JSON.stringify(ret.data).slice(0, 90));

  const order = await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(orderId) });
  ok('order is now paid', order.status === 'paid', order.status);
  ok('exactly one key was claimed', order.items[0].keyIds.length === 1, JSON.stringify(order.items[0].keyIds.map(String)));

  const keysAfter = await db.collection('gamekeys').countDocuments({ status: 'available' });
  ok('key inventory dropped by exactly one', keysAfter === keysBefore - 1, `${keysBefore} -> ${keysAfter}`);

  const soldKey = await db.collection('gamekeys').findOne({ _id: order.items[0].keyIds[0] });
  ok('claimed key is linked to the order', String(soldKey.order) === String(orderId));
  ok('claimed key is linked to the buyer', String(soldKey.user) === String(user._id));

  const lib = await db.collection('users').findOne({ _id: user._id });
  ok('game landed in the library', (lib.library || []).some((e) => String(e.game) === String(game._id)));
  ok('order appears in purchase history', (lib.purchaseHistory || []).some((p) => String(p) === String(orderId)));

  const g = await db.collection('games').findOne({ _id: game._id });
  ok('developer was credited', (g.stats.revenueGross || 0) > 0, 'revenueGross=' + g.stats.revenueGross);
  const dev = await db.collection('users').findOne({ _id: g.developer });
  ok('developer balance increased', (dev.devProfile?.balanceOwed || 0) > 0, 'owed=' + dev.devProfile?.balanceOwed);

  // the basket must be empty now — leaving it populated re-orders every item on
  // the next checkout and takes a second key for each
  const cartAfter = await call('GET', '/api/cart');
  ok('cart emptied after a settled payment', (cartAfter.data.items || []).length === 0,
    (cartAfter.data.items || []).length + ' items left');

  // ---- 6. replay the same callback: must be a no-op
  const replay = await call('GET', backTo.replace(B, '').replace('/payment/return', '/api/payment/return'));
  ok('replayed callback is idempotent', replay.data.already === true, JSON.stringify(replay.data).slice(0, 80));
  const keysAfterReplay = await db.collection('gamekeys').countDocuments({ status: 'available' });
  ok('replay claimed no extra key', keysAfterReplay === keysAfter, `${keysAfter} -> ${keysAfterReplay}`);

  const orderAfterReplay = await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(orderId) });
  ok('order still has exactly one key', orderAfterReplay.items[0].keyIds.length === 1);

  // ---- 7. IPN with a forged signature is refused
  const forged = new URL(backTo);
  forged.searchParams.set('vnp_SecureHash', 'f'.repeat(128));
  const ipn = await call('GET', '/api/payment/ipn' + forged.search);
  ok('IPN rejects a forged signature', ipn.data && ipn.data.RspCode === '97', 'RspCode=' + ipn.data?.RspCode);

  // ---- 8. cancelling at the gateway leaves nothing behind
  const game2 = await db.collection('games').findOne({ price: { $gt: 0 }, 'stats.keysAvailable': { $gt: 2 } });
  await call('POST', '/api/cart/add', { gameId: game2._id, qty: 1 });
  const place2 = await call('POST', '/api/checkout/place', { method: 'standard', country: 'US' });
  const u2 = new URL(place2.data.paymentUrl);
  u2.pathname = '/sandbox-gateway/result';
  const back2 = (await fetch(u2.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: 'act=fail', redirect: 'manual',
  })).headers.get('location');
  const ret2 = await call('GET', back2.replace(B, '').replace('/payment/return', '/api/payment/return'));
  ok('cancelled payment reports failure', ret2.data.ok === false, JSON.stringify(ret2.data).slice(0, 70));
  const order2 = await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(place2.data.orderId) });
  ok('cancelled order is cancelled', order2.status === 'cancelled', order2.status);
  ok('cancelled order claimed no key', order2.items.every((i) => (i.keyIds || []).length === 0));
  const keysAfterFail = await db.collection('gamekeys').countDocuments({ status: 'available' });
  ok('failed payment consumed no stock', keysAfterFail === keysAfter, `${keysAfter} -> ${keysAfterFail}`);
  const cartAfterFail = await call('GET', '/api/cart');
  ok('cart kept after a declined payment', (cartAfterFail.data.items || []).length === 1,
    (cartAfterFail.data.items || []).length + ' item(s) still there so it can be retried');

  // ---- 9. two concurrent callbacks for the same payment: only one fulfils
  // The declined payment above deliberately kept its item in the basket, so
  // start from an empty one — otherwise this order would legitimately contain
  // two games and the key count below would be measuring the wrong thing.
  const leftover = await call('GET', '/api/cart');
  for (const item of leftover.data.items || []) {
    await call('POST', '/api/cart/remove', { key: item.key });
  }
  const empty = await call('GET', '/api/cart');
  ok('basket emptied before the race test', (empty.data.items || []).length === 0);

  const game3 = await db.collection('games').findOne({ price: { $gt: 0 }, 'stats.keysAvailable': { $gt: 2 } });
  await call('POST', '/api/cart/add', { gameId: game3._id, qty: 1 });
  const place3 = await call('POST', '/api/checkout/place', { method: 'standard', country: 'US' });
  const u3 = new URL(place3.data.paymentUrl);
  u3.pathname = '/sandbox-gateway/result';
  const loc3 = (await fetch(u3.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: 'act=ok', redirect: 'manual',
  })).headers.get('location');
  const path3 = loc3.replace(B, '').replace('/payment/return', '/api/payment/return');
  const before3 = await db.collection('gamekeys').countDocuments({ status: 'available' });
  const both = await Promise.all([call('GET', path3), call('GET', path3), call('GET', path3)]);
  const wins = both.filter((r) => r.data.ok && !r.data.already).length;
  const losers = both.filter((r) => r.data.already).length;
  const after3 = await db.collection('gamekeys').countDocuments({ status: 'available' });
  ok('three parallel callbacks, exactly one settled', wins === 1, `${wins} winner, ${losers} told it was already settled`);
  ok('parallel callbacks consumed exactly one key', before3 - after3 === 1, `${before3} -> ${after3}`);
  const order3 = await db.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(place3.data.orderId) });
  const keysInOrder3 = order3.items.reduce((s, i) => s + (i.keyIds || []).length, 0);
  ok('race order recorded exactly one key', keysInOrder3 === 1, keysInOrder3 + ' keyIds');

  const totals = await db.collection('payments').aggregate([
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]).toArray();
  console.log('\n  payments by status: ' + JSON.stringify(Object.fromEntries(totals.map((t) => [t._id, t.n]))));

  /* Each run buys things and credits developers, so both accumulate and the
     figures stop being reproducible between runs. Put the books back. */
  if (process.argv.includes('--clean')) {
    await db.collection('orders').deleteMany({});
    await db.collection('payments').deleteMany({});
    await db.collection('gamekeys').updateMany({ status: 'sold' },
      { $set: { status: 'available', order: null, user: null, soldAt: null } });
    // Handing keys back by writing to the database bypasses the application, so
    // the stats counter it decremented during the run is never restored. Recompute
    // it from the inventory, otherwise --clean leaves the store badges showing a
    // stock level that no longer matches the key rows.
    const perGame = await db.collection('gamekeys').aggregate([
      { $match: { status: 'available' } },
      { $group: { _id: '$game', n: { $sum: 1 } } },
    ]).toArray();
    const realStock = new Map(perGame.map((r) => [String(r._id), r.n]));
    for (const g of await db.collection('games').find({}).toArray()) {
      await db.collection('games').updateOne({ _id: g._id },
        { $set: { 'stats.keysAvailable': realStock.get(String(g._id)) || 0 } });
    }
    // Zero the counter rather than unsetting it: the Dev console reads
    // stats.revenueGross, and $unset left the field missing on every document,
    // which made that page throw and blank out.
    await db.collection('games').updateMany({}, { $set: { 'stats.revenueGross': 0 } });
    await db.collection('users').updateMany({ 'devProfile.balanceOwed': { $exists: true } },
      { $set: { 'devProfile.balanceOwed': 0 } });
    for (const u of await db.collection('users').find({}).toArray()) {
      await db.collection('users').updateOne({ _id: u._id },
        { $set: { library: [], toyLibrary: [], purchaseHistory: [] } });
    }
    await db.collection('games').updateMany({},
      { $set: { 'stats.unitsDigital': 0, 'stats.unitsPhysical': 0, 'stats.keysSold': 0 } });
    console.log('  test data cleared: orders, payments, key stock, libraries, developer balances');
  }

  console.log('\n' + (bad ? bad + ' FAILURES' : 'payment runs end to end, and survives tampering, replay and races'));
  await shutdown(bad ? 1 : 0);
})().catch(async (e) => { console.error('test crashed:', e); await shutdown(1); });