export async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    ...(opts.body && typeof opts.body !== 'string' ? { body: JSON.stringify(opts.body) } : {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
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
