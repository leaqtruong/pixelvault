/* Load the catalog into a remote Atlas cluster and verify it.
 *
 * The local importer is driven by MONGO_URI, so pointing it at Atlas is all
 * that is needed — but it is worth checking the link before writing 650 rows
 * and hours of Steam requests, so this connects first and reports what it sees.
 *
 *   $env:MONGO_URI='mongodb+srv://...'
 *   node seed/load-remote.js --check
 *   node seed/load-remote.js --run
 */
require('dotenv').config();
const mongoose = require('mongoose');

const RUN = process.argv.includes('--run');
const CHECK = process.argv.includes('--check') || !RUN;
const uri = process.env.MONGO_URI;

const watchdog = setTimeout(() => { console.error('FAIL watchdog'); process.exit(2); }, 600000);
watchdog.unref();
const done = async (code) => { try { await mongoose.disconnect(); } catch {} clearTimeout(watchdog); process.exit(code); };

(async () => {
  if (!uri) return console.error('MONGO_URI is not set.');
  if (!/^mongodb\+srv:\/\//.test(uri)) {
    console.log('MONGO_URI looks like a local address (' + uri.replace(/:[^:@]+@/, ':***@') + ').');
    console.log('This script is meant for the Atlas cluster — it will not touch local data by accident.');
    return done(1);
  }
  console.log('target: ' + uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  } catch (e) {
    console.log('\nCannot reach the cluster: ' + e.message);
    console.log('\nMost common causes:');
    console.log('  - the password is wrong, or still literally "<db_password>"');
    console.log('  - Network Access does not contain 0.0.0.0/0');
    console.log('  - the username is not the one you created');
    return done(1);
  }

  const db = mongoose.connection.db;
  const cols = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = cols.map((c) => c.name);
  console.log('\nconnected. server ' + (await db.admin().serverInfo()).version);
  console.log('collections already here: ' + (names.length ? names.join(', ') : '(none — empty cluster)'));

  if (CHECK) {
    if (!names.length) {
      console.log('\nNothing loaded yet. Run with --run to fill it in.');
      return done(0);
    }
    console.log('\ncurrent contents:');
    for (const n of names) console.log('  ' + n.padEnd(11) + await db.collection(n).countDocuments());
    return done(0);
  }

  // --run: fill the cluster
  const { execFileSync } = require('node:child_process');
  const steps = [
    ['seed/import-steam.js', 'catalog game + keys + users'],
    ['seed/enrich-steam.js', 'system requirements, publishers, Steam categories'],
    ['seed/import-workshop.js', 'mods from the Steam Workshop, with source recorded'],
    ['seed/upgrade-covers.js', 'highest resolution cover art'],
    ['seed/seed-toys.js', 'toy catalog'],
    ['seed/seed-reviews.js', 'reviews'],
  ];
  for (const [file, what] of steps) {
    const args = file.includes('import-workshop') ? ['--apply', '--pages', '2'] : [];
    console.log('\n=== ' + file + ' — ' + what + ' ===');
    try {
      const out = execFileSync('node', [file, ...args], { encoding: 'utf8', timeout: 900000 });
      process.stdout.write(out.split('\n').slice(-6).join('\n'));
    } catch (e) {
      console.log('  step failed: ' + String(e.message).slice(0, 200));
      if (e.stdout) console.log(String(e.stdout).split('\n').slice(-6).join('\n'));
    }
  }

  console.log('\n=== final contents ===');
  for (const n of (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort()) {
    console.log('  ' + n.padEnd(11) + await db.collection(n).countDocuments());
  }
  return done(0);
})().catch((e) => { console.error('crashed:', e); done(1); });