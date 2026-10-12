/* HTTP for Steam, resilient to DNS that will not resolve Steam at all.
 *
 * On some networks (observed on a machine in Vietnam using 8.8.8.8) every
 * Steam hostname — store.steampowered.com, steamcommunity.com,
 * api.steampowered.com — resolves to 127.0.0.1, while GitHub, npm and the
 * Nexus API resolve normally. Plain fetch then fails with "fetch failed",
 * which looks like the site being down rather than a resolver problem.
 *
 * Querying a DNS-over-HTTPS endpoint returns the real address, so this module
 * resolves the hostname itself and connects straight to the resulting IP while
 * keeping the original Host header and TLS SNI. Everything is cached, and if
 * DoH is also unreachable it falls back to ordinary fetch.
 */
const https = require('node:https');
const http = require('node:http');
const dns = require('node:dns');

const DOH = [
  'https://1.1.1.1/dns-query?name=',
  'https://dns.google/resolve?name=',
];

const ipCache = new Map();
let dohHealthy = null;

function isSteamHost(host) {
  return /(^|\.)(steampowered\.com|steamstatic\.com|steamcommunity\.com)$/i.test(host);
}

async function resolveViaDoH(host) {
  for (const base of DOH) {
    try {
      const res = await fetch(base + encodeURIComponent(host) + '&type=A', {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const addrs = (json.Answer || []).filter((a) => a.type === 1).map((a) => a.data)
        .filter((ip) => !/^127\./.test(ip) && !/^0\./.test(ip));
      if (addrs.length) { dohHealthy = true; return addrs; }
    } catch { /* try the next resolver */ }
  }
  return null;
}

async function resolveHost(host) {
  if (ipCache.has(host)) return ipCache.get(host);
  if (dohHealthy === false) return null;

  // the system resolver first — no DoH round-trip when it works
  try {
    const ans = await dns.promises.resolve4(host);
    const good = ans.filter((ip) => !/^127\./.test(ip) && !/^0\./.test(ip));
    if (good.length) { ipCache.set(host, good); dohHealthy = true; return good; }
  } catch { /* fall through to DoH */ }

  const doh = await resolveViaDoH(host);
  if (!doh) { dohHealthy = false; return null; }
  ipCache.set(host, doh);
  return doh;
}

/* Round-robins across the addresses Steam hands out, so a single bad edge
   does not fail every request. Node calls the lookup either as
   cb(null, ip, family) or — when options.all is set — cb(null, [{address,
   family}]); getting that wrong throws ERR_INVALID_IP_ADDRESS. */
function makeLookup(hostCache) {
  let cursor = 0;
  return (hostname, options, callback) => {
    const list = hostCache.get(hostname);
    if (!list || !list.length) return dns.lookup(hostname, options, callback);
    const opts = typeof options === 'object' && options !== null ? options : {};
    const familyFilter = opts.family;
    const usable = familyFilter ? list.filter((ip) => ip.includes(':') === (familyFilter === 6)) : list;
    const pool = usable.length ? usable : list;
    const toEntry = (ip) => ({ address: ip, family: ip.includes(':') ? 6 : 4 });
    if (opts.all) {
      const start = cursor++ * pool.length;
      const rotated = pool.map((_, i) => pool[(start + i) % pool.length]);
      return callback(null, rotated.map(toEntry));
    }
    const ip = pool[cursor++ % pool.length];
    return callback(null, ip, ip.includes(':') ? 6 : 4);
  };
}

/* Minimal fetch-shaped wrapper: steamFetch(url) -> { ok, status, headers, text() }. */
function steamFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (e) { return reject(e); }
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request(
      parsed,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
        signal: options.signal,
        lookup: makeLookup(ipCache),
      },
      (res) => {
        // follow one round of redirects, like fetch does
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && options.redirect !== 'manual') {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          res.on('end', () => resolve(steamFetch(next, options)));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            headers: { get: (k) => res.headers[k.toLowerCase()] ?? null },
            buffer: () => buf,
            text: async () => buf.toString('utf8'),
            json: async () => JSON.parse(buf.toString('utf8')),
          });
        });
      },
    );
    req.on('error', reject);
    if (options.timeout) req.setTimeout(options.timeout, () => req.destroy(new Error('timeout')));
    if (options.body) req.write(options.body);
    req.end();
  });
}

/* Order matters. Plain fetch is the well-trodden path, so it goes first and
   the DoH route only engages when it fails — a custom HTTP client is more
   code to get subtly wrong, and it should never be the default. */
async function get(url, options = {}) {
  const steamHost = isSteamHost(new URL(url).hostname);
  try {
    return await fetch(url, options);
  } catch (e) {
    if (!steamHost) throw e;
    if (!ipCache.has(new URL(url).hostname)) await resolveHost(new URL(url).hostname);
    return steamFetch(url, options);
  }
}

/** Plain GET returning the body text, or null when the host is unreachable. */
async function getText(url, options = {}) {
  const res = await get(url, options);
  return res.ok ? res.text() : null;
}

module.exports = { get, getText, steamFetch, resolveHost, isSteamHost };

if (require.main === module) {
  (async () => {
    const target = process.argv[2] || 'https://steamcommunity.com/workshop/browse/?appid=105600&browsesort=trend&section=readytouseitems&p=1';
    const host = new URL(target).hostname;
    console.log('host              : ' + host);
    console.log('system DNS        : ' + (await dns.promises.resolve4(host).catch((e) => e.code)).join?.(', ') || 'failed');
    const r = await resolveHost(host);
    console.log('resolved via      : ' + (r ? r.join(', ') : 'FAILED'));
    const res = await get(target);
    console.log('HTTP              : ' + res.status + '  ok=' + res.ok);
    const body = await res.text();
    console.log('body              : ' + Math.round(body.length / 1024) + 'KB');
    const m = body.match(/<script type="application\/json" id="valve-ssr-data"[^>]*>([\s\S]*?)<\/script>/);
    console.log('SSR data block    : ' + (m ? 'present (' + Math.round(m[1].length / 1024) + 'KB)' : 'MISSING'));
  })().catch((e) => { console.error('FAILED:', e.message); process.exitCode = 1; });
}