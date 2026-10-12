/* Verify mirrored mods carry real, attributable data — no invented figures,
   no row without a source, and nothing that could be mistaken for a
   PixelVault-hosted download. */
require('dotenv').config();
const mongoose = require('mongoose');
const B = 'http://127.0.0.1:3000';

(async () => {
  let bad = 0;
  const ok = (n, c, x = '') => { if (!c) bad++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const mods = await db.collection('mods').find({}).toArray();

  ok('mods collection is populated', mods.length > 0, mods.length + ' rows');
  if (!mods.length) { await mongoose.disconnect(); return; }

  const steam = mods.filter((m) => m.source?.provider === 'steam-workshop');
  ok('every mirrored row declares its provider', steam.length === mods.length, steam.length + '/' + mods.length);

  const noId = steam.filter((m) => !m.source.id);
  ok('every mirrored row records the workshop item id', noId.length === 0, noId.map((m) => m.title).join(', ') || 'none');

  const badUrl = steam.filter((m) => !/^https:\/\/steamcommunity\.com\/sharedfiles\/filedetails\/\?id=\d+$/.test(m.source.url || ''));
  ok('source url points at the original Steam page', badUrl.length === 0, badUrl.length + ' malformed');

  const noGameUrl = steam.filter((m) => !/^https:\/\/steamcommunity\.com\/app\/\d+$/.test(m.source.gameUrl || ''));
  ok('parent game workshop url recorded', noGameUrl.length === 0, noGameUrl.length + ' missing');

  const noAuthorId = steam.filter((m) => !/^\d{17}$/.test(m.source.authorId || ''));
  ok('steamid64 recorded for every mod', noAuthorId.length === 0, noAuthorId.length + ' missing');

  const noRetrieved = steam.filter((m) => !m.source.retrievedAt);
  ok('retrieval timestamp recorded', noRetrieved.length === 0, noRetrieved.length + ' missing');

  // Steam's counts must be real numbers, and free-to-play-ish outliers stand out
  const numeric = (m, k) => typeof m.mirror?.[k] === 'number' && Number.isFinite(m.mirror[k]);
  const allNumeric = steam.every((m) => ['subscriptions', 'favorites', 'views', 'votes', 'rating', 'comments', 'fileSize'].every((k) => numeric(m, k)));
  ok('every Steam figure is a real number', allNumeric);

  const sizes = steam.map((m) => m.mirror.fileSize);
  ok('file sizes are plausible (0 excluded, max < 2 GB)', sizes.every((s) => s > 0 && s < 2147483648), `min ${Math.min(...sizes)} max ${Math.max(...sizes)}`);

  const subs = steam.map((m) => m.mirror.subscriptions);
  ok('subscriber counts are non-negative', subs.every((s) => s >= 0), `min ${Math.min(...subs)} max ${Math.max(...subs)}`);

  // the rule that started this: no invented version on a mirrored mod
  const withVersion = steam.filter((m) => m.version !== undefined && m.version !== null && m.version !== '');
  ok('no invented version on mirrored mods', withVersion.length === 0, withVersion.map((m) => `${m.title}=${m.version}`).join(', ') || 'none');

  const withLoader = steam.filter((m) => m.loader);
  ok('no invented loader on mirrored mods', withLoader.length === 0, withLoader.length + ' set');

  // Steam publishes no download file size separate from file_size, and we must
  // not imply we host anything
  const withDownloadUrl = steam.filter((m) => m.downloadUrl);
  ok('no hosted download url on mirrored mods', withDownloadUrl.length === 0, withDownloadUrl.length + ' set');

  const named = steam.filter((m) => m.source.author);
  ok('author names resolved where possible', named.length > 0, `${named.length}/${steam.length} named; the rest keep their steamid64`);

  // links must all point at real Steam ids
  const idsOk = steam.every((m) => String(m.source.id) === new URL(m.source.url).searchParams.get('id'));
  ok('source url id matches the recorded id', idsOk);

  // the API must agree with the database
  const res = await fetch(B + '/api/mods?limit=100');
  const api = await res.json();
  ok('API serves the same mod count', api.mods.length === Math.min(60, mods.length), `api=${api.mods.length} db=${mods.length}`);
  const withSource = api.mods.filter((m) => m.source?.url);
  ok('API exposes the source url', withSource.length === api.mods.length, withSource.length + '/' + api.mods.length);

  const filtered = await (await fetch(B + '/api/mods?source=local&limit=100')).json();
  ok('source=local filter excludes mirrored mods', filtered.mods.length === 0, filtered.mods.length + ' local mods');

  await mongoose.disconnect();
  console.log('\n' + (bad ? bad + ' FAILURES' : 'every mirrored mod is real data with a recorded source'));
  process.exitCode = bad ? 1 : 0;
})().catch((e) => { console.error('check failed:', e); process.exitCode = 1; });