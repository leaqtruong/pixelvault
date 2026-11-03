/* In-memory login throttle.
 *
 * Slows password guessing against /api/auth/login. Keyed by client IP plus the
 * submitted email, so one IP cannot burn through many accounts and one account
 * cannot be locked out by a noisy IP. State is per process, which is correct
 * for a single Render instance or a local run; a multi-instance deployment
 * would move this into MongoDB or a shared cache.
 */
const attempts = new Map();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 15 * 60 * 1000;

function keyFor(req, email) {
  return `${req.ip || 'unknown'}:${String(email || '').toLowerCase()}`;
}

/* Call before checking credentials. */
function check(req, email) {
  const now = Date.now();
  const rec = attempts.get(keyFor(req, email));
  if (rec && rec.blockedUntil && rec.blockedUntil > now) {
    return { blocked: true, retryAfterSec: Math.ceil((rec.blockedUntil - now) / 1000) };
  }
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    attempts.set(keyFor(req, email), { count: 0, firstAt: now, blockedUntil: null });
  }
  return { blocked: false };
}

/* Call on a wrong password or an unknown account. */
function recordFailure(req, email) {
  const now = Date.now();
  const k = keyFor(req, email);
  let rec = attempts.get(k);
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    rec = { count: 0, firstAt: now, blockedUntil: null };
  }
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) rec.blockedUntil = now + BLOCK_MS;
  attempts.set(k, rec);
}

/* Call on a successful login so the counter does not linger. */
function clear(req, email) {
  attempts.delete(keyFor(req, email));
}

module.exports = { check, recordFailure, clear };
