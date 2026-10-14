/* Payment gateway adapter.
 *
 * The signing and verification here are VNPay's actual scheme — parameters
 * sorted by key, values percent-encoded, joined as a query string with
 * encode:false, then HMAC-SHA512 signed — so the code that verifies a real
 * callback is the same code the sandbox exercises.
 *
 * Two drivers:
 *   vnpay    live, used when VNP_TMN_CODE and VNP_HASH_SECRET are configured
 *   sandbox  the flow runs end to end with no merchant account; it signs with
 *            the same algorithm and never moves money
 *
 * `live` is recorded on every payment row so a report can never mistake one
 * for the other.
 */
const crypto = require('crypto');

/* VNPay expects yyyyMMddHHmmss in GMT+7, whatever timezone the server runs
 * in. The previous formatter interleaved the fields and repeated the clock
 * parts, emitting 18 digits that the gateway cannot parse. Pin the zone
 * explicitly - Render serves from UTC. */
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d = new Date()) => {
  const vn = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  return `${vn.getFullYear()}${pad(vn.getMonth() + 1)}${pad(vn.getDate())}` +
         `${pad(vn.getHours())}${pad(vn.getMinutes())}${pad(vn.getSeconds())}`;
};

/* No published fallback for the signing key.
 *
 * An earlier version fell back to a constant string shipped in this file. That
 * was harmless while no merchant account existed, but the moment a real
 * VNP_HASH_SECRET is configured the fallback becomes a live vulnerability:
 * if the variable is ever missing, every signature is computed with a value
 * anyone can read on GitHub, and a forged callback hands out free keys.
 *
 * Sandbox therefore signs with its own secret - a fresh random one per boot
 * unless SANDBOX_HASH_SECRET pins it - so no simulation can ever be validated
 * against a constant that lives in the repository. */
let sandboxSecret = null;
function SECRET() {
  if (process.env.VNP_HASH_SECRET) return process.env.VNP_HASH_SECRET;
  if (!sandboxSecret) {
    sandboxSecret = process.env.SANDBOX_HASH_SECRET || crypto.randomBytes(32).toString('hex');
  }
  return sandboxSecret;
}

/* VNPay signs the parameters sorted by key and already percent-encoded, joined
   with & — not with the default form encoding, which would turn spaces into %20. */
function signData(params) {
  const sorted = {};
  for (const key of Object.keys(params).sort()) {
    if (key === 'vnp_SecureHash' || params[key] === undefined || params[key] === null) continue;
    sorted[key] = encodeURIComponent(String(params[key])).replace(/%20/g, '+');
  }
  return Object.entries(sorted).map(([k, v]) => `${k}=${v}`).join('&');
}

function hmac(data, secret) {
  return crypto.createHmac('sha512', secret).update(Buffer.from(data, 'utf8')).digest('hex');
}

function isConfigured() {
  return !!(process.env.VNP_TMN_CODE && process.env.VNP_HASH_SECRET && process.env.VNP_URL);
}

const provider = () => (isConfigured() ? 'vnpay' : 'sandbox');

/* Join parameters that are ALREADY percent-encoded.
 *
 * This must not encode again. createPaymentUrl and sandboxResponse both encode
 * before signing, so encoding here a second time turns a value like
 * "PixelVault+order+abc" into "PixelVault%2Border%2Babc" on the wire; Express
 * then decodes it back to "PixelVault+order+abc", and the verification pass
 * encodes it a third time — the signature can never match. */
function toQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

/** Build the URL the shopper is sent to. */
function createPaymentUrl({ amount, orderId, orderInfo, ipAddr, returnUrl, bankCode, locale, expireMinutes = 15 }) {
  const p = provider();
  const base = p === 'vnpay'
    ? process.env.VNP_URL
    : (process.env.SANDBOX_GATEWAY_URL || 'http://127.0.0.1:3000/sandbox-gateway');

  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: p === 'vnpay' ? process.env.VNP_TMN_CODE : 'SANDBOX',
    vnp_Locale: locale || 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderId,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: 'other',
    vnp_Amount: String(amount),
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr || '127.0.0.1',
    vnp_CreateDate: fmtDate(),
    // Required for API 2.1.0. The gateway rejects a pay request without it.
    vnp_ExpireDate: fmtDate(new Date(Date.now() + expireMinutes * 60000)),
  };
  if (bankCode) params.vnp_BankCode = bankCode;

  const paramsSigned = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, encodeURIComponent(String(v)).replace(/%20/g, '+')]),
  );
  paramsSigned.vnp_SecureHash = hmac(signData(params), SECRET());

  return { url: `${base}?${toQuery(paramsSigned)}`, provider: p, live: p === 'vnpay' };
}

/** Verify a callback. Constant-time compare on the signature. */
function verifyCallback(query) {
  const params = { ...query };
  const given = String(params.vnp_SecureHash || '');
  delete params.vnp_SecureHash;
  if (!given) return false;
  const expected = hmac(signData(params), SECRET());
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* What the sandbox gateway hands back after the shopper confirms. The bank code
 * is folded into the parameters *before* signing so the store's verification
 * attests it too — appending it after the hash would leave it uncovered. */
function sandboxResponse({ txnRef, amount, status, bankCode }) {
  const ok = status !== 'fail';
  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: 'SANDBOX',
    vnp_TxnRef: txnRef,
    vnp_Amount: String(amount),
    vnp_OrderInfo: 'Sandbox payment',
    vnp_TransactionNo: String(Date.now()),
    vnp_TransactionDate: fmtDate(),
    vnp_ResponseCode: ok ? '00' : '99',
    vnp_BankCode: bankCode || 'NCSH',
    vnp_BankTranNo: String(Date.now()),
    vnp_TransactionStatus: ok ? '00' : '99',
  };
  const signed = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, encodeURIComponent(String(v)).replace(/%20/g, '+')]),
  );
  signed.vnp_SecureHash = hmac(signData(params), SECRET());
  return signed;
}

/* vnp_BankCode is forwarded, never enumerated here.
 *
 * A live gateway renders its own bank selector from the list it holds, so
 * hardcoding codes would mean inventing data with no source. The codes are not
 * guessable either: VietinBank is CTG, Eximbank is EIB, DongA is BHD, and the
 * list changes as banks merge. The reference implementation behaves the same
 * way — it takes bankCode from the request and passes it straight through. */
module.exports = { createPaymentUrl, verifyCallback, sandboxResponse, queryOf: toQuery, provider, isConfigured, signData, hmac, fmtDate };