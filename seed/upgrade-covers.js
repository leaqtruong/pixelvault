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

/* Largest-first. header.jpg is only 460x215, which is what made the cards
   look soft on a hi-dpi screen. Steam's tallest capsule is 600x900. */
const PORTRAIT_CHAIN = [
  (id) => `${CDN}/${id}/library_600x900_2x.jpg`,   // 600x900
  (id) => `${CDN}/${id}/library_600x900.jpg`,      // 300x450
  (id) => `${CDN}/${id}/capsule_616x353.jpg`,      // 616x353
  (id) => `${STORE}/${id}/library_600x900_2x.jpg`,
  (id) => `${STORE}/${id}/capsule_616x353.jpg`,
  // last resort: a 1920-wide banner still beats a 460px one once cropped
  (id) => `${STORE}/${id}/library_hero.jpg`,
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

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const games = await db.collection('games').find({ steamAppId: { $exists: true, $ne: null } }).toArray();

  let coverUp = 0, heroUp = 0, kept = 0;
  const keptTitles = [];

  for (const g of games) {
    const id = g.steamAppId;
    const hiCover = await firstHit(PORTRAIT_CHAIN, id);
    const hero = await firstHit(HERO_CHAIN, id);

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