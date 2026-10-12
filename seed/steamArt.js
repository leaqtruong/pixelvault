/* Resolve the highest-resolution cover art Steam publishes for an app.
   The store API's header_image is only 460x215, which renders soft in the
   card grid on a hi-dpi screen. Steam also serves the same artwork as a
   600x900 capsule and a 1920x620 hero. Candidates are HEAD-checked and the
   first that exists wins; a title with no extra assets keeps its banner. */

const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
const STORE = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps';

const PORTRAIT = [
  (id) => `${CDN}/${id}/library_600x900_2x.jpg`,    // 600x900, tallest capsule Steam has
  (id) => `${CDN}/${id}/library_600x900.jpg`,
  (id) => `${CDN}/${id}/capsule_616x353.jpg`,        // 616x353
  (id) => `${STORE}/${id}/library_600x900_2x.jpg`,
  (id) => `${STORE}/${id}/capsule_616x353.jpg`,
  (id) => `${STORE}/${id}/library_hero.jpg`,         // 1920x620, still better than a 460px banner
];
const HERO = [
  (id) => `${CDN}/${id}/library_hero.jpg`,
  (id) => `${STORE}/${id}/library_hero.jpg`,
];

async function reachable(url) {
  try { return (await fetch(url, { method: 'HEAD' })).ok; }
  catch { return false; }
}

async function firstHit(chain, id) {
  for (const make of chain) {
    const u = make(id);
    if (await reachable(u)) return u;
  }
  return null;
}

/** @returns {Promise<{cover:string, hero:string|null}>} */
async function resolveArt(appid, fallback) {
  if (!appid) return { cover: fallback, hero: null };
  const [cover, hero] = await Promise.all([
    firstHit(PORTRAIT, appid),
    firstHit(HERO, appid),
  ]);
  return { cover: cover || fallback, hero };
}

module.exports = { resolveArt };