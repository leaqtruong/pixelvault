/* Mirror real mods from the Steam Workshop into the PixelVault catalog.
 *
 * Source: steamcommunity.com/workshop/browse/ — a public page, no API key.
 * The page is server-rendered, so the item list arrives as JSON inside
 * <script type="application/json" id="valve-ssr-data">, wrapped in TanStack
 * Query entries. The importer matches on queryKey[0] === "workshop_browse"
 * rather than grabbing the first `results` array it sees.
 *
 * Everything stored is reported by Steam: title, description, tags, file
 * size, subscription/favourite/view/vote counts, star rating. Nothing is
 * inferred. Steam does not publish a version string for a Workshop item, so
 * `version` is left unset rather than filled with a placeholder.
 *
 * Two phases, because Steam throttles aggressively (HTTP 429):
 *   1. browse   — cheap: one request per page, no per-item fetching
 *   2. authors  — one request per distinct author, slow, and resumable
 *
 *   node seed/import-workshop.js                    dry run, browse only
 *   node seed/import-workshop.js --apply            write mods (no author fetch)
 *   node seed/import-workshop.js --apply --pages 3
 *   node seed/import-workshop.js --apply --appids 105600,730
 *   node seed/import-workshop.js --apply --authors      fill in author names
 *   node seed/import-workshop.js --authors --limit 200  do 200, then stop
 */
require('dotenv').config();
const mongoose = require('mongoose');
const steamFetch = require('../lib/steamFetch');

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};
const PER_PAGE = 30;
const BROWSE_DELAY = Number(process.env.WORKSHOP_DELAY_MS || 900);
const AUTHOR_DELAY = Number(process.env.WORKSHOP_AUTHOR_DELAY_MS || 1600);

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const APPLY = !!arg('apply', false);
const PAGES = Math.max(1, Number(arg('pages', 2)));
const ONLY_APPIDS = String(arg('appids', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const DO_AUTHORS = !!arg('authors', false);
const AUTHOR_LIMIT = Number(arg('limit', 0)) || Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uniq = (a) => [...new Set(a.filter(Boolean))];

let throttled = 0;
let lastNetworkError = null;

/* Steam answers 429 with a tiny error page. Honour Retry-After, then back off
   hard — a workshop item is not worth failing an import over. A connection
   error is a different thing entirely and is recorded, not retried blindly. */
async function get(url, tries = 4) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await steamFetch.get(url, { headers: UA, redirect: 'follow' });
      if (res.status === 429) {
        throttled++;
        const retryAfter = Number(res.headers.get('retry-after')) * 1000;
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5000 * attempt);
        continue;
      }
      return res.ok ? res.text() : null;
    } catch (e) {
      lastNetworkError = `${e.code || e.name}: ${e.message}`;
      await sleep(3000 * attempt);
    }
  }
  return null;
}

/* The SSR payload nests TanStack Query entries inside JSON-encoded strings,
   so the search recurses through strings as well as objects. */
function findBrowseResults(root) {
  const seen = new WeakSet();
  let hit = null;
  const visit = (node, depth) => {
    if (hit || depth > 8 || !node) return;
    if (typeof node === 'string') {
      const t = node.trim();
      if (t[0] === '{' || t[0] === '[') { try { visit(JSON.parse(t), depth + 1); } catch { /* not JSON */ } }
      return;
    }
    if (typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach((x) => visit(x, depth + 1)); return; }
    const key = Array.isArray(node.queryKey) ? node.queryKey[0] : null;
    if (key === 'workshop_browse' && node.state?.data && Array.isArray(node.state.data.results)) {
      hit = node.state.data;
      return;
    }
    for (const v of Object.values(node)) visit(v, depth + 1);
  };
  visit(root, 0);
  return hit;
}

/* Distinguishing "this game has no Workshop" from "Steam throttled us" matters:
   reporting a fetch failure as an absence would quietly shrink the catalog. */
async function browsePage(appid, page) {
  const html = await get(`https://steamcommunity.com/workshop/browse/?appid=${appid}&browsesort=trend&section=readytouseitems&p=${page}`);
  if (html === null) return { ok: false, reason: lastNetworkError ? 'unreachable (' + lastNetworkError + ')' : 'throttled' };
  const m = html.match(/<script type="application\/json" id="valve-ssr-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { ok: false, reason: 'no SSR block' };
  try {
    const data = findBrowseResults(JSON.parse(m[1]));
    // no workshop_browse query at all means the game genuinely has no workshop
    return data ? { ok: true, data } : { ok: false, reason: 'no workshop' };
  } catch (e) {
    return { ok: false, reason: 'unparseable payload' };
  }
}

/* Steam shows the author's public name only on the item's own page, as the
   last breadcrumb: "… > Workshop > ExoField's Workshop". The link text is the
   real name; the URL segment is a vanity name only when the author set one,
   and is their steamid64 otherwise. */
async function resolveAuthor(publishedfileid, steamid64) {
  const html = await get(`https://steamcommunity.com/sharedfiles/filedetails/?id=${publishedfileid}`);
  if (!html) return { name: null, failed: true };
  const link = html.match(/href="https:\/\/steamcommunity\.com\/(?:id|profiles)\/([^"/]+)\/myworkshopfiles[^"]*"[^>]*>([^<]{1,80})<\/a>/);
  if (!link) return { name: null, failed: false };
  const [, vanity, text] = link;
  const clean = text.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ').trim();
  let name = clean.replace(/['’]s?\s*Workshop\s*$/i, '').trim();
  if (/^\d{17}$/.test(name)) name = null;                 // name was a bare id
  if (!name) name = /^\d{17}$/.test(vanity) ? null : vanity; // fall back to a real vanity
  return { name: name || null, failed: false };
}

function toMod(item, game, authorName) {
  return {
    game: game._id,
    title: String(item.title || 'Untitled mod').slice(0, 160),
    tagline: String(item.short_description || '').slice(0, 200),
    description: String(item.short_description || '').slice(0, 4000),
    previewImage: item.preview_url || '',
    screenshots: (item.previews || []).map((p) => p.url).filter(Boolean).slice(0, 6),
    tags: uniq((item.tags || []).map((t) => t.display_name || t.tag).map((s) => String(s).slice(0, 40))).slice(0, 12),
    source: {
      provider: 'steam-workshop',
      id: String(item.publishedfileid),
      url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${item.publishedfileid}`,
      author: authorName || null,
      authorId: item.creator || null,
      gameUrl: `https://steamcommunity.com/app/${game.steamAppId}`,
      retrievedAt: new Date(),
    },
    mirror: {
      subscriptions: Number(item.subscriptions) || 0,
      favorites: Number(item.favorited) || 0,
      views: Number(item.views) || 0,
      votes: Number(item.total_votes) || 0,
      rating: Number(item.star_rating) || 0,
      comments: Number(item.num_comments_public) || 0,
      fileSize: Number(item.file_size) || 0,
      createdAt: item.time_created ? new Date(item.time_created * 1000) : null,
      updatedAt: item.time_updated ? new Date(item.time_updated * 1000) : null,
    },
    status: 'published',
  };
}

// ---------------------------------------------------------------- phase 1
async function importBrowse(db) {
  const query = { steamAppId: { $type: 'number', $gt: 0 } };
  if (ONLY_APPIDS.length) query.steamAppId = { $in: ONLY_APPIDS.map(Number) };
  const games = await db.collection('games').find(query)
    .project({ title: 1, slug: 1, steamAppId: 1 }).sort({ title: 1 }).toArray();

  console.log(`catalog titles with a Steam appid : ${games.length}`);
  console.log(`mode                             : ${APPLY ? 'WRITE to MongoDB' : 'dry run'}`);
  console.log(`pages per game                   : ${PAGES} (${PER_PAGE} items each, up to ${PAGES * PER_PAGE} mods)`);
  console.log(`author names                     : ${DO_AUTHORS ? 'resolved in phase 2' : 'not fetched in this phase'}\n`);

  let written = 0, gamesWithMods = 0, totalPublished = 0, noWorkshop = 0;
  const failedGames = [];
  const seen = new Set();

  for (const game of games) {
    const first = await browsePage(game.steamAppId, 1);
    await sleep(BROWSE_DELAY);
    if (!first.ok) {
      if (first.reason === 'no workshop') { noWorkshop++; console.log(`  [no workshop]  ${game.title}`); }
      else { failedGames.push(`${game.title} (${first.reason})`); console.log(`  [FAILED]       ${game.title} — ${first.reason}`); }
      continue;
    }
    const data1 = first.data;
    const published = data1.total_count || 0;
    totalPublished += published;
    gamesWithMods++;
    console.log(`  ${game.title} — ${published.toLocaleString('en-US')} items published`);

    let collected = data1.results.filter((r) => r && r.publishedfileid);
    for (let p = 2; p <= PAGES && p * PER_PAGE < published; p++) {
      const res = await browsePage(game.steamAppId, p);
      await sleep(BROWSE_DELAY);
      if (!res.ok) { failedGames.push(`${game.title} page ${p} (${res.reason})`); break; }
      collected = collected.concat(res.data.results.filter((r) => r && r.publishedfileid));
    }

    let kept = 0;
    for (const item of collected) {
      const id = String(item.publishedfileid);
      if (seen.has(id)) continue;
      seen.add(id);
      const doc = toMod(item, game, null);
      kept++;
      if (APPLY) {
        await db.collection('mods').updateOne(
          { 'source.provider': 'steam-workshop', 'source.id': id },
          // $set would wipe an author name a previous run already resolved
          { $setOnInsert: doc, $set: { 'mirror': doc.mirror, 'source.retrievedAt': doc.source.retrievedAt, status: 'published' } },
          { upsert: true },
        );
      }
      if (kept <= 2) {
        console.log(`      ${doc.title}`);
        console.log(`        ${doc.mirror.subscriptions.toLocaleString('en-US')} subscribers · ${(doc.mirror.fileSize / 1048576).toFixed(1)} MB · ${doc.tags.slice(0, 3).join(', ')}`);
      }
    }
    written += kept;
    console.log(`      -> ${kept} mods ${APPLY ? 'written' : 'to be written'}\n`);
  }

  if (APPLY) {
    await db.collection('mods').createIndex({ 'source.provider': 1, 'source.id': 1 }, { unique: true, sparse: true });
  }
  console.log('=== browse summary ===');
  console.log(`  games scanned           : ${games.length}`);
  console.log(`  games publishing mods   : ${gamesWithMods}`);
  console.log(`  games with no workshop  : ${noWorkshop}`);
  console.log(`  games that FAILED       : ${failedGames.length}${failedGames.length ? ' — re-run to retry these' : ''}`);
  if (failedGames.length) console.log('    ' + failedGames.join('\n    '));
  console.log(`  items that exist on Steam in total : ${totalPublished.toLocaleString('en-US')}`);
  console.log(`  mods ${APPLY ? 'written ' : 'collected'}          : ${written}`);
  console.log(`  HTTP 429 from Steam     : ${throttled}`);
  if (lastNetworkError) {
    console.log('\n  Steam was unreachable for at least one request:');
    console.log(`    ${lastNetworkError}`);
    console.log('    Every failed game is listed above. Re-run when the network allows —');
    console.log('    the importer upserts on (provider, id), so a re-run only adds what is missing.');
  }
  return { gamesWithMods, totalPublished, written, noWorkshop, failedGames };
}

// ---------------------------------------------------------------- phase 2
async function importAuthors(db) {
  const missing = await db.collection('mods')
    .find({ 'source.provider': 'steam-workshop', 'source.authorId': { $exists: true }, 'source.author': null })
    .project({ 'source.id': 1, 'source.authorId': 1 })
    .limit(AUTHOR_LIMIT === Infinity ? 0 : AUTHOR_LIMIT).toArray();

  const distinct = new Map();
  for (const m of missing) if (!distinct.has(m.source.authorId)) distinct.set(m.source.authorId, m.source.id);

  console.log(`\n=== author phase ===`);
  console.log(`  mods still missing an author : ${missing.length}`);
  console.log(`  distinct authors to look up  : ${distinct.size}`);
  console.log(`  delay between requests       : ${AUTHOR_DELAY} ms\n`);

  const byId = new Map();
  let done = 0, found = 0, gaveUp = 0;
  for (const [steamid64, sampleId] of distinct) {
    const { name, failed } = await resolveAuthor(sampleId, steamid64);
    await sleep(AUTHOR_DELAY);
    if (name) { byId.set(steamid64, name); found++; }
    else if (failed) gaveUp++;
    done++;
    if (done % 10 === 0 || done === distinct.size) {
      console.log(`  ${done}/${distinct.size} looked up · ${found} named · ${gaveUp} throttled`);
    }
  }

  if (APPLY && byId.size) {
    const ops = [...byId].map(([steamid64, name]) => ({
      updateOne: { filter: { 'source.authorId': steamid64 }, update: { $set: { 'source.author': name } } },
    }));
    const res = await db.collection('mods').bulkWrite(ops, { ordered: false });
    console.log(`\n  names written to ${res.modifiedCount} mods`);
  } else if (byId.size) {
    console.log(`\n  ${byId.size} names resolved — re-run with --apply to store them`);
  }

  const stillNull = await db.collection('mods').countDocuments({ 'source.provider': 'steam-workshop', 'source.author': null });
  console.log(`  mods with no author name : ${stillNull}`);
  return { found, gaveUp };
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  if (DO_AUTHORS) await importAuthors(db);
  else await importBrowse(db);
  await mongoose.disconnect();
})().catch((e) => { console.error('import failed:', e); process.exitCode = 1; });