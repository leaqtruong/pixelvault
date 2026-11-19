/* Resolve a comma/list of genre names (or ObjectIds) into Genre ids.
 *
 * Used by the admin/dev game forms and by the seed importers. A genre is a
 * controlled document now, so a rename or a hidden genre is one edit instead
 * of a sweep across every game.
 */
const mongoose = require('mongoose');
const Genre = require('../models/Genre');

const slugify = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

async function resolveGenres(input, fallback = 'Indie') {
  const rows = Array.isArray(input) ? input : String(input || '').split(',');
  const names = rows.map((s) => String(s).trim()).filter(Boolean);
  if (!names.length && fallback) names.push(fallback);

  const ids = [];
  for (const name of names) {
    if (mongoose.isValidObjectId(name)) {
      const existing = await Genre.findById(name).select('_id').lean();
      if (existing) { ids.push(existing._id); continue; }
    }
    const slug = slugify(name);
    if (!slug) continue;
    const genre = await Genre.findOneAndUpdate(
      { slug },
      { $setOnInsert: { slug, name, active: true, sortOrder: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    ids.push(genre._id);
  }
  return [...new Set(ids.map(String))].map((id) => new mongoose.Types.ObjectId(id));
}

module.exports = { resolveGenres, slugify };
