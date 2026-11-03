/* Resolve the highest-resolution cover art Steam publishes for an app.
   The store API's header_image is only 460x215, which renders soft in the
   card grid on a hi-dpi screen. Steam also serves the same artwork as a
   600x900 capsule and a 1920x620 hero. Candidates are HEAD-checked and the
   first that exists wins; a title with no extra assets keeps its banner. */

const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
const STORE = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps';

/* The card grid, tables and detail rail all force a 16:9 landscape frame, so
   the cover must be landscape. Steam's portrait 600x900 library capsule looked
   fine on its own but got centre-cropped into the 16:9 box, cutting off titles
   and faces. Prefer the 616x353 landscape capsule, then the 460x215 header,
   then the wide hero; portrait is only a last resort. */
const COVER = [
  (id) => `${CDN}/${id}/capsule_616x353.jpg`,        // 616x353 landscape capsule
  (id) => `${CDN}/${id}/header.jpg`,                 // 460x215 landscape header
  (id) => `${STORE}/${id}/capsule_616x353.jpg`,
  (id) => `${CDN}/${id}/library_hero.jpg`,           // 1920x620 landscape hero
  (id) => `${STORE}/${id}/library_hero.jpg`,
  (id) => `${CDN}/${id}/library_600x900_2x.jpg`,     // 600x900 portrait, last resort
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
    firstHit(COVER, appid),
    firstHit(HERO, appid),
  ]);
  return { cover: cover || fallback, hero };
}

module.exports = { resolveArt };