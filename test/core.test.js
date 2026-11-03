'use strict';
const test = require('node:test');
const assert = require('node:assert');

/* keyCrypto — pure Node crypto, no network or database. */
process.env.KEY_ENCRYPTION_SECRET = 'test-secret-that-is-at-least-32-chars-long';
const { encryptKey, decryptKey, hashKey, makeDemoKey } = require('../lib/keyCrypto');

test('keyCrypto round-trips a plaintext key', () => {
  const plain = 'DEMO-ABCDE-FGHIJ-KLMNO';
  const enc = encryptKey(plain);
  assert.ok(typeof enc === 'string' && enc.split('.').length === 3, 'payload is iv.tag.cipher');
  assert.strictEqual(decryptKey(enc), plain);
});

test('keyCrypto produces a unique ciphertext for the same plaintext', () => {
  assert.notStrictEqual(encryptKey('DEMO-AAAAA-BBBBB-CCCCC'), encryptKey('DEMO-AAAAA-BBBBB-CCCCC'));
});

test('hashKey is deterministic and trims', () => {
  assert.strictEqual(hashKey(' abc '), hashKey('abc'));
  assert.notStrictEqual(hashKey('abc'), hashKey('abd'));
});

test('makeDemoKey is unmistakably a demo key', () => {
  assert.match(makeDemoKey(), /^DEMO-[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}$/);
});

/* paymentGateway — the VNPay HMAC-SHA512 signing scheme, in sandbox mode. */
delete process.env.VNP_TMN_CODE;
delete process.env.VNP_HASH_SECRET;
delete process.env.VNP_URL;
process.env.SANDBOX_HASH_SECRET = 'sandbox-secret-for-tests';
const gateway = require('../lib/paymentGateway');

function signedQuery() {
  const url = gateway.createPaymentUrl({
    amount: 250000000,
    orderId: 'PVTEST' + Date.now(),
    orderInfo: 'PixelVault test order',
    ipAddr: '127.0.0.1',
    returnUrl: 'http://127.0.0.1:3000/payment/return',
    locale: 'vn',
  });
  return Object.fromEntries(new URL(url.url).searchParams);
}

test('sandbox payment URL verifies against its own signature', () => {
  assert.strictEqual(gateway.verifyCallback(signedQuery()), true);
});

test('a tampered amount fails signature verification', () => {
  const q = signedQuery();
  q.vnp_Amount = '1';
  assert.strictEqual(gateway.verifyCallback(q), false);
});

test('hmac is deterministic for the same input and secret', () => {
  assert.strictEqual(gateway.hmac('a=1&b=2', 'secret'), gateway.hmac('a=1&b=2', 'secret'));
});
