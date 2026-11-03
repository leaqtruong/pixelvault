/* Import Steam's popular user-defined tags into the catalog.
 *
 * The Store API (`appdetails`) returns official `genres` and `categories`, but
 * NOT the user-defined tags shown on a store page ("Sandbox", "Survival",
 * "Pixel Graphics", ...). Those live only in the store page HTML, so they are
 * scraped here and written to the `tags` field that the API and detail page
 * already read.
 *
 * Safe to re-run: it only replaces `tags`. Age-gated titles return a check
 * page with no tags and are left unchanged.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { get } = require('../lib/steamFetch');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'" };
const decode = (s) => String(s).replace(/&(amp|lt|gt|quot|#039);/g, (m) => ENTITIES[m] || m);

function parseTags(html) {
  const tags = [];
  const re = /<a[^>]+class="[^"]*app_tag[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = decode(m[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (t && !tags.includes(t)) tags.push(t);
  }
  return tags;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const games = await db.collection('games')
    .find({ steamAppId: { $exists: true, $ne: null } })
    .sort({ title: 1 })
    .toArray();

  console.log(`importing Steam tags for ${games.length} titles`);
  let updated = 0, none = 0, failed = 0;

  for (const g of games) {
    try {
      const url = `https://store.steampowered.com/app/${g.steamAppId}`;
      const res = await get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' } });
      const html = await res.text();
      const tags = parseTags(html);
      if (tags.length) {
        await db.collection('games').updateOne({ _id: g._id }, { $set: { tags } });
        updated++;
        console.log(`  ${g.title}: ${tags.length} tags -> ${tags.slice(0, 6).join(', ')}${tags.length > 6 ? ' …' : ''}`);
      } else {
        none++;
        console.log(`  ${g.title}: no tags found (age-gate or layout change), left unchanged`);
      }
    } catch (e) {
      failed++;
      console.log(`  ${g.title}: FAIL ${e.message}`);
    }
    await sleep(500);
  }

  console.log(`\nupdated ${updated}, no tags ${none}, failed ${failed}`);
  await mongoose.disconnect();
})().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
