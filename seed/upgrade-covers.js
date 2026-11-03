/* Upgrade stored cover art to the high-resolution Steam CDN assets.
   The importer used appdetails' header_image, which is a 460x215 banner — too
   small for the card grid, so covers looked soft. Steam serves the same artwork
   at real resolution:
     library_600x900_2x  600x900   portrait cover
     library_hero       1920x620  wide hero / first screenshot
   Every candidate is HEAD-checked; anything that 404s keeps its old art. */
require('dotenv').config();
const mongoose = require('mongoose');

const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps';
const STORE = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps';
const APPLY = process.argv.includes('--apply');

/* Landscape-first. The store renders every cover in a 16:9 frame, so a
   portrait 600x900 capsule gets centre-cropped and looks cut off. Prefer the
   616x353 landscape capsule, then the header, then the hero. */
const COVER_CHAIN = [
  (id) => `${CDN}/${id}/capsule_616x353.jpg`,      // 616x353 landscape capsule
  (id) => `${CDN}/${id}/header.jpg`,               // 460x215 landscape header
  (id) => `${STORE}/${id}/capsule_616x353.jpg`,
  (id) => `${CDN}/${id}/library_hero.jpg`,         // 1920x620 landscape hero
  (id) => `${STORE}/${id}/library_hero.jpg`,
  (id) => `${CDN}/${id}/library_600x900_2x.jpg`,   // 600x900 portrait, last resort
];
const HERO_CHAIN = [
  (id) => `${CDN}/${id}/library_hero.jpg`,         // 1920x620
  (id) => `${STORE}/${id}/library_hero.jpg`,
];

async function ok(url) {
  try { return (await fetch(url, { method: 'HEAD' })).ok; }
  catch { return false; }
}

async function firstHit(chain, id) {
  for (const make of chain) { const u = make(id); if (await ok(u)) return u; }
  return null;
}

/* Newer apps publish their capsules under content-hashed store_item_assets
   paths that cannot be constructed from an appid alone. The Store API's
   header_image is the correct landscape URL for those. */
async function headerImage(id) {
  try {
    const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=US&l=en`, {
      headers: { 'User-Agent': 'PixelVault-Coursework-Demo/1.0' },
    });
    const j = await r.json();
    const e = j[String(id)];
    if (e && e.success && e.data.header_image) return e.data.header_image;
  } catch {}
  return null;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const games = await db.collection('games').find({ steamAppId: { $exists: true, $ne: null } }).toArray();

  let coverUp = 0, heroUp = 0, kept = 0;
  const keptTitles = [];

  for (const g of games) {
    const id = g.steamAppId;
    let hiCover = await firstHit(COVER_CHAIN, id);
    const hero = await firstHit(HERO_CHAIN, id);

    if (!hiCover) hiCover = await headerImage(id);

    const nextCover = hiCover || g.coverImage;
    if (hiCover) coverUp++; else { kept++; keptTitles.push(`${g.title} (${id})`); }

    let shots = Array.isArray(g.screenshots) ? g.screenshots.slice() : [];
    if (hero) { shots = [hero, ...shots.filter((s) => s !== hero)]; heroUp++; }

    const oldFirst = (g.screenshots || [])[0];
    if (APPLY && (nextCover !== g.coverImage || shots[0] !== oldFirst)) {
      await db.collection('games').updateOne({ _id: g._id }, { $set: { coverImage: nextCover, screenshots: shots } });
    }
  }

  console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'} over ${games.length} games`);
  console.log(`  portrait cover upgraded : ${coverUp}`);
  console.log(`  wide hero upgraded     : ${heroUp}`);
  console.log(`  kept the 460x215 header: ${kept}`);
  if (keptTitles.length) for (const t of keptTitles) console.log('    - ' + t);
  if (!APPLY) console.log('\n  re-run with --apply to write');
  await mongoose.disconnect();
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });