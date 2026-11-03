/* Live Steam price check.
 *
 * Catalog metadata and prices are imported once (seed/import-steam.js). A price
 * captured at import time goes stale the moment a sale ends: the cart then
 * charges a figure the store no longer offers, and the customer has no way to
 * see that before paying. Measured example on this database: Terraria is stored
 * at 4.99 with a 50% discount (2.50 final) while the store now sells it at 9.99.
 *
 * This module asks the public Steam Store API for the current price of the
 * games in a cart and reports the ones that no longer match. The Store API
 * needs no key and no account.
 *
 * The Store API is also an external dependency, and checkout must not break
 * when it is unreachable. A network failure, a timeout or a malformed answer is
 * treated as "no opinion": the stored price is used and the sale proceeds. Only
 * an explicit answer from Steam is acted on — a price, or success:false for an
 * app that has been delisted. Blocking a sale because Steam was slow would turn
 * an outage on their side into lost revenue on ours.
 */
const cache = new Map();

const ttlMs = () => Number(process.env.STEAM_PRICE_TTL_MINUTES || 10) * 60000;
/* A "could not reach Steam" answer is cached far more briefly: after an outage
   the very next checkout should try again, not inherit the failure for ten
   minutes. */
const UNKNOWN_TTL_MS = 60000;
const timeoutMs = () => Number(process.env.STEAM_PRICE_TIMEOUT_MS || 5000);
/* Overridable so the fallback path can be exercised against a dead host. */
const baseUrl = () => process.env.STEAM_STORE_BASE || 'https://store.steampowered.com';

async function loadPrice(appid) {
  const key = String(appid);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs());
  try {
    const url = `${baseUrl()}/api/appdetails?appids=${encodeURIComponent(key)}&cc=US&l=en`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'PixelVault-Coursework/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const entry = body && body[key];
    if (!entry) return { status: 'unknown', reason: 'no entry in response' };
    if (!entry.success) return { status: 'unavailable', appid: key };

    const d = entry.data || {};
    const p = d.price_overview;
    const free = !!d.is_free;
    const final = free ? 0 : p && Number.isFinite(p.final) ? p.final / 100 : null;
    /* A free app has no price_overview block at all, which is a real answer.
       A paid app without one is not: it usually means the app is region-locked
       or mid-delisting, and guessing a number there would be worse than
       skipping the check. */
    if (final === null) return { status: 'unknown', reason: 'no price block' };

    return {
      status: 'ok',
      appid: key,
      name: d.name,
      currency: (p && p.currency) || 'USD',
      final,
      initial: free ? 0 : p && Number.isFinite(p.initial) ? p.initial / 100 : final,
      discountPct: free ? 0 : (p && p.discount_percent) || 0,
    };
  } catch (e) {
    return { status: 'unknown', reason: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

/* Returns { status: 'ok' | 'unavailable' | 'unknown', ... }. Never throws. */
async function priceFor(appid, opts = {}) {
  const key = String(appid);
  const hit = cache.get(key);
  if (!opts.noCache && hit) {
    const age = Date.now() - hit.at;
    const life = hit.value.status === 'unknown' ? UNKNOWN_TTL_MS : ttlMs();
    if (age < life) return hit.value;
  }
  const value = await loadPrice(key);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/* Compare a cart against live Steam prices.
 *
 * items      the session cart
 * gamesById  Map of gameId -> { steamAppId, title }
 *
 * Returns the drifts and the delisted apps, plus counters so a caller (or a
 * test) can tell "nothing changed" apart from "nothing was checked".
 * A difference of one cent is ignored: Steam quotes in whole cents converted
 * from a US store price, and the stored figure was rounded the same way.
 */
async function verify(items, gamesById, opts = {}) {
  const targets = (items || []).filter(
    (i) => (i.kind || 'game') !== 'toy' && (i.edition || 'digital') === 'digital',
  );

  const changes = [];
  const unavailable = [];
  const skipped = [];
  let checked = 0;

  await Promise.all(
    targets.map(async (it) => {
      const g = gamesById && gamesById.get(String(it.gameId));
      if (!g || !g.steamAppId) {
        skipped.push({ key: it.key, reason: 'no steam appid' });
        return;
      }
      const p = await priceFor(g.steamAppId, opts);
      if (p.status === 'unknown') {
        skipped.push({ key: it.key, reason: p.reason });
        return;
      }
      checked += 1;
      if (p.status === 'unavailable') {
        unavailable.push({ key: it.key, title: g.title || it.title, appid: g.steamAppId });
        return;
      }
      /* Only USD is comparable. The catalog was imported with cc=US, so a
         different currency means the request was answered by a different
         storefront, and subtracting one from the other would be nonsense. */
      if (p.currency !== 'USD') {
        skipped.push({ key: it.key, reason: `currency ${p.currency}` });
        return;
      }
      const was = Number(it.unitPrice);
      if (!Number.isFinite(was) || Math.abs(was - p.final) < 0.01) return;
      changes.push({
        key: it.key,
        gameId: String(it.gameId),
        title: g.title || it.title,
        appid: g.steamAppId,
        was: +was.toFixed(2),
        now: +p.final.toFixed(2),
        initial: +Number(p.initial).toFixed(2),
        discountPct: p.discountPct,
      });
    }),
  );

  changes.sort((a, b) => a.key.localeCompare(b.key));
  unavailable.sort((a, b) => a.key.localeCompare(b.key));

  return { checked, changes, unavailable, skipped };
}

module.exports = { priceFor, verify, _cache: cache };
