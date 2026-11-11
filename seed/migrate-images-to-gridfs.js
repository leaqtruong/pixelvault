/* Download every remote image in the catalog and move it into MongoDB GridFS.
 *
 * Before this, cover/screenshot/preview URLs pointed straight at Steam's CDN
 * and the site hotlinked them. After running, each image is fetched once,
 * stored in the 'images' GridFS bucket, and the document field is rewritten to
 * the self-hosted /api/media/<fileId> URL. Safe to re-run: URLs already
 * pointing at /api/media/ are left alone, and repeated URLs are deduped so the
 * same image is not uploaded twice.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongoose').mongo;
const Game = require('../models/Game');
const Toy = require('../models/Toy');
const Mod = require('../models/Mod');

const contentTypeFor = (url) => (
  /\.png(\?|$)/i.test(url) ? 'image/png'
    : /\.webp(\?|$)/i.test(url) ? 'image/webp'
    : 'image/jpeg'
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'images' });
  const seen = new Map(); // remote url -> fileId string
  let uploaded = 0, kept = 0, failed = 0;

  async function upload(url) {
    if (!url) return url;
    if (url.startsWith('/api/media/')) { kept++; return url; }
    if (seen.has(url)) return `/api/media/${seen.get(url)}`;

    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'PixelVault-Coursework-Demo/1.0' } });
      if (!res.ok) { failed++; console.log(`  FAIL ${res.status} ${url}`); return url; }
      const buf = Buffer.from(await res.arrayBuffer());
      const stream = bucket.openUploadStream(url, { contentType: contentTypeFor(url) });
      const id = stream.id.toString();
      await new Promise((resolve, reject) => {
        stream.once('finish', resolve);
        stream.once('error', reject);
        stream.end(buf);
      });
      seen.set(url, id);
      uploaded++;
      return `/api/media/${id}`;
    } catch (e) {
      failed++;
      console.log(`  FAIL ${url}: ${e.message}`);
      return url;
    }
  }

  async function migrateGames() {
    const rows = await Game.find({}).lean();
    console.log(`games: ${rows.length}`);
    for (const g of rows) {
      const cover = await upload(g.coverImage);
      const shots = [];
      for (const s of (g.screenshots || [])) shots.push(await upload(s));
      await Game.updateOne({ _id: g._id }, { $set: { coverImage: cover, screenshots: shots } });
      await sleep(100);
    }
  }

  async function migrateToys() {
    const rows = await Toy.find({}).lean();
    console.log(`toys: ${rows.length}`);
    for (const t of rows) {
      const cover = await upload(t.coverImage);
      const shots = [];
      for (const s of (t.screenshots || [])) shots.push(await upload(s));
      await Toy.updateOne({ _id: t._id }, { $set: { coverImage: cover, screenshots: shots } });
      await sleep(100);
    }
  }

  async function migrateMods() {
    const rows = await Mod.find({}).lean();
    console.log(`mods: ${rows.length}`);
    for (const m of rows) {
      const preview = await upload(m.previewImage);
      const shots = [];
      for (const s of (m.screenshots || [])) shots.push(await upload(s));
      await Mod.updateOne({ _id: m._id }, { $set: { previewImage: preview, screenshots: shots } });
      await sleep(100);
    }
  }

  await migrateGames();
  await migrateToys();
  await migrateMods();

  console.log(`\nuploaded ${uploaded}, already-local ${kept}, failed ${failed}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error('migration failed:', e); process.exit(1); });
