/* Tiny in-memory TTL cache for read-only GET endpoints.
 *
 * Deliberately simple and process-local: it exists to stop identical list/home
 * requests from re-running the same Mongoose query every time the SPA mounts.
 * It is NOT a shared cache and survives nothing across a restart — that is
 * exactly what a single instance needs. Only public, session-independent
 * responses are cached; anything that depends on the signed-in user must never
 * pass through here.
 */

const store = new Map();

function cache(ttlSeconds = 30) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();
    const key = req.originalUrl;
    const hit = store.get(key);
    if (hit && hit.expires > Date.now()) {
      res.set('X-Cache', 'HIT');
      return res.json(hit.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        store.set(key, { body, expires: Date.now() + ttlSeconds * 1000 });
      }
      res.set('X-Cache', 'MISS');
      return originalJson(body);
    };
    next();
  };
}

cache.clear = () => store.clear();

module.exports = cache;
