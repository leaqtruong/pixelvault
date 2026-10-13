/* Remove placeholder values that older runs left behind.
 *
 * Two distinct problems:
 *   1. fields set to null still exist in the document; $unset removes them
 *   2. contentWarnings holds arrays of null on titles where Steam published
 *      nothing usable (content_descriptors.ids comes back as objects with no
 *      description, so mapping to x.description produced [null])
 *
 * Dry run by default. Pass --apply to write. Safe to re-run.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const UNSET_IF = ['version', 'rating', 'fileSizeGB'];

(async () => {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const games = db.collection('games');

  const nullFields = {};
  for (const f of UNSET_IF) nullFields[f] = await games.countDocuments({ [f]: null });

  // arrays that are [null], [null,null], ... i.e. no usable value at all
  const junkWarnings = await games.countDocuments({
    contentWarnings: { $elemMatch: { $eq: null } },
  });
  const junkCatalogs = await games.countDocuments({ categories: { $elemMatch: { $eq: null } } });
  const junkFeatures = await games.countDocuments({ features: { $elemMatch: { $eq: null } } });

  console.log(`${apply ? 'APPLIED' : 'DRY RUN'} over ${await games.countDocuments()} games\n`);
  for (const [f, n] of Object.entries(nullFields)) {
    console.log(`  ${f.padEnd(14)} : ${String(n).padStart(3)} rows hold null`);
  }
  console.log(`  contentWarnings with null entries : ${junkWarnings}`);
  console.log(`  categories       with null entries : ${junkCatalogs}`);
  console.log(`  features         with null entries : ${junkFeatures}`);

  if (apply) {
    const unsetRes = await games.updateMany(
      { $or: UNSET_IF.map((f) => ({ [f]: null })) },
      { $unset: Object.fromEntries(UNSET_IF.map((f) => [f, ''])) },
    );
    console.log(`\n  unset nulls from ${unsetRes.modifiedCount} games`);

    // strip only the null elements; keep any real strings that are present
    for (const f of ['contentWarnings', 'categories', 'features', 'genres', 'tags', 'platforms']) {
      const r = await games.updateMany(
        { [f]: { $elemMatch: { $eq: null } } },
        { $set: { [f]: { $filter: { input: `$${f}`, as: 'v', cond: { $ne: ['$$v', null] } } } } },
      );
      if (r.modifiedCount) console.log(`  cleaned ${r.modifiedCount} games: ${f}`);
    }

    // re-check
    const after = {};
    for (const f of UNSET_IF) after[f] = await games.countDocuments({ [f]: { $exists: true } });
    console.log('\n  after: ' + Object.entries(after).map(([f, n]) => `${f} present on ${n}`).join('  '));
    const warn = await games.countDocuments({ contentWarnings: { $elemMatch: { $eq: null } } });
    console.log(`  after: contentWarnings with nulls = ${warn}`);
  } else {
    console.log('\n  re-run with --apply to write');
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('cleanup failed:', e.message); process.exitCode = 1; });