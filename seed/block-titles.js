/* Remove specific appids from the catalog, with their demo keys.
   Needed because Steam's appdetails endpoint returns
   content_descriptors.ids as empty objects (no `description`), so an
   automated mature-content filter cannot read the descriptors at all.
   This list is therefore curated by hand and audited against the store. */
require('dotenv').config();
const mongoose = require('mongoose');

// Audited as unsuitable for this storefront: adult titles and a ship-sim DLC pack.
const BLOCK_APPIDS = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);

(async () => {
  if (!BLOCK_APPIDS.length) {
    console.error('usage: node block-titles.js <appid> [appid...]');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  for (const id of BLOCK_APPIDS) {
    const g = await db.collection('games').findOne({ steamAppId: id });
    if (!g) { console.log(`  ${id}: not in the catalog`); continue; }
    const k = await db.collection('gamekeys').deleteMany({ game: g._id });
    await db.collection('reviews').deleteMany({ game: g._id });
    await db.collection('posts').deleteMany({ game: g._id });
    await db.collection('games').deleteOne({ _id: g._id });
    console.log(`  removed "${g.title}" (${id}) with ${k.deletedCount} demo key(s)`);
  }

  console.log(`catalog now: ${await db.collection('games').countDocuments({ status: 'published' })} published`);
  await mongoose.disconnect();
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });