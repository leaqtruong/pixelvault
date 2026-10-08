// Live external data from public Steam APIs (no key needed).
// - Player counts: ISteamUserStats/GetNumberOfCurrentPlayers
// - Review verdicts: store appreviews query_summary (total + score desc)
// Results cached in-memory for 10 minutes to respect rate limits.
const cache = new Map(); // key -> { at, data }
const TTL = 10 * 60 * 1000;

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'PixelVault-Coursework-Demo/1.0' } });
  if (!r.ok) throw new Error(`Steam API HTTP ${r.status}`);
  return r.json();
}

async function playerCount(appid) {
  try {
    const j = await getJson(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`);
    return j?.response?.player_count ?? null;
  } catch { return null; }
}

async function reviewSummary(appid) {
  try {
    const j = await getJson(`https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`);
    const q = j?.query_summary;
    if (!q) return null;
    return { total: q.total_reviews ?? 0, desc: q.review_score_desc ?? null, score: q.review_score ?? null };
  } catch { return null; }
}

async function newsFor(appid, count = 3) {
  try {
    const j = await getJson(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appid}&count=${count}&maxlength=250&format=json`);
    return (j?.appnews?.newsitems || []).map((n) => ({ title: n.title, url: n.url, feed: n.feedlabel, date: n.date ? new Date(n.date * 1000).toISOString() : null }));
  } catch { return []; }
}

async function liveFor(appid) {
  if (!appid) return { players: null, reviews: null };
  const key = String(appid);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const [players, reviews] = await Promise.all([playerCount(appid), reviewSummary(appid)]);
  const data = { players, reviews, fetchedAt: new Date().toISOString() };
  cache.set(key, { at: Date.now(), data });
  return data;
}

module.exports = { liveFor, newsFor };
