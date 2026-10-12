/* Strip values that were invented rather than mirrored from Steam.
   Older imports filled install size, version and an ESRB rating with
   plausible-looking numbers, which put fake figures on the storefront and
   silently defeated the "hide mature titles" preference. Run once after
   upgrading; safe to re-run. */
require('dotenv').config();
const mongoose = require('mongoose');

const GENERIC_VERSION = ['1.0.0', 'v1.0.0', ''];

(async () => {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const games = await db.collection('games').find({}).toArray();
  let clearedVersion = 0, clearedRating = 0, clearedSize = 0, clearedWarehouse = 0, clearedWeight = 0;

  for (const g of games) {
    const set = {};
    if (g.version !== undefined && GENERIC_VERSION.includes(String(g.version))) { set.version = null; clearedVersion++; }
    if (g.rating !== undefined && ['T', 'E'].includes(g.rating) && !g.devRated) { set.rating = null; clearedRating++; }

    // weight/warehouse only mean anything for a physical edition the studio ships
    const phys = g.physical || {};
    if (!phys.enabled) {
      if (phys.warehouse) { set['physical.warehouse'] = ''; clearedWarehouse++; }
      if (phys.weightLb) { set['physical.weightLb'] = 0; clearedWeight++; }
    }
    if (Object.keys(set).length && apply) await db.collection('games').updateOne({ _id: g._id }, { $set: set });
  }

  // install size was derived from the appid modulo, so it can be identified
  const sizeless = games.filter((g) => g.fileSizeGB !== undefined && g.fileSizeGB !== null);
  for (const g of sizeless) if (apply) await db.collection('games').updateOne({ _id: g._id }, { $set: { fileSizeGB: null } });
  clearedSize = sizeless.length;

  console.log(`${apply ? 'APPLIED' : 'DRY RUN'} over ${games.length} titles`);
  console.log(`  invented version strings cleared : ${clearedVersion}`);
  console.log(`  invented age ratings cleared     : ${clearedRating}`);
  console.log(`  invented install sizes cleared   : ${clearedSize}`);
  console.log(`  placeholder warehouses cleared   : ${clearedWarehouse}`);
  console.log(`  placeholder weights cleared      : ${clearedWeight}`);
  if (!apply) console.log('\n  re-run with --apply to write');
  await mongoose.disconnect();
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });