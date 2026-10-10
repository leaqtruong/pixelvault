export async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    ...(opts.body && typeof opts.body !== 'string' ? { body: JSON.stringify(opts.body) } : {}),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 503) {
    const e = new Error(data.error || 'Database is not available yet.');
    e.dbDown = true;
    throw e;
  }
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}

/* Poll an endpoint until the database answers. Used by the boot screen so a
   cold start shows "connecting" instead of a broken page. */
export async function waitForDb(path = '/stats', tries = 40, gapMs = 1500) {
  for (let i = 0; i < tries; i++) {
    try { return await api(path); } catch (e) { if (!e.dbDown) throw e; }
    await new Promise((r) => setTimeout(r, gapMs));
  }
  throw new Error('Database did not come up. Check that MongoDB is running.');
}

export const priceOf = (g) => +(g.price * (1 - (g.discountPct || 0) / 100)).toFixed(2);

export function verdict(avg, n) {
  if (!n) return null;
  if (avg >= 4.5) return 'Overwhelmingly Positive';
  if (avg >= 4) return 'Very Positive';
  if (avg >= 3.5) return 'Mostly Positive';
  if (avg >= 3) return 'Mixed';
  return 'Mostly Negative';
}
