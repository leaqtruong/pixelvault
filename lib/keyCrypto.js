// AES-256-GCM key encryption for game_keys.
// No new dependency — uses Node built-in crypto.
// KEY_ENCRYPTION_SECRET must be 32+ chars; derived via SHA-256.
const crypto = require('crypto');

function secretKey() {
  const raw = process.env.KEY_ENCRYPTION_SECRET || process.env.SESSION_SECRET || 'pixelvault-dev-secret-change-me-32chars!!';
  return crypto.createHash('sha256').update(String(raw)).digest(); // 32 bytes
}

function encryptKey(plain) {
  const key = secretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv.tag.cipher (base64)
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

function decryptKey(payload) {
  const key = secretKey();
  const [ivB64, tagB64, dataB64] = String(payload).split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Bad key payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const out = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return out.toString('utf8');
}

function hashKey(plain) {
  return crypto.createHash('sha256').update(String(plain).trim()).digest('hex');
}

// Demo placeholder key format — clearly NOT a real Steam key.
// Real Steam keys are XXXX-XXXXX-XXXXX from publishers; these are DEMO-XXXXX-XXXXX-XXXXX.
function makeDemoKey(prefix = 'DEMO') {
  const seg = (n) => crypto.randomBytes(n).toString('hex').toUpperCase().slice(0, n === 3 ? 5 : 5);
  const r = () => crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 5);
  return `${prefix}-${r()}-${r()}-${r()}`;
}

module.exports = { encryptKey, decryptKey, hashKey, makeDemoKey };
