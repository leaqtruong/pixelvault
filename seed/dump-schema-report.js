/* Ground truth for the coursework document: real collection names, real
   field lists, real indexes, real row counts. Nothing hand-written. */
require('dotenv').config();
const mongoose = require('mongoose');
const models = ['User', 'Game', 'Toy', 'GameKey', 'Order', 'Review', 'Mod', 'Post'];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const out = {};

  for (const name of models) {
    const M = require('../models/' + name);
    const coll = M.collection.collectionName;
    const count = await db.collection(coll).countDocuments();
    const sample = await db.collection(coll).findOne({});
    const indexes = (await db.collection(coll).indexes()).filter((i) => i.name !== '_id_');
    out[name] = {
      collection: coll,
      count,
      schemaPaths: Object.entries(M.schema.paths)
        .filter(([k]) => !k.startsWith('_') && !k.endsWith('_'))
        .map(([k, v]) => ({ path: k, type: typeName(v), required: !!v.options?.required, ref: v.options?.ref || null })),
      indexes: indexes.map((i) => ({ name: i.name, keys: i.key, unique: !!i.unique })),
      sampleKeys: sample ? Object.keys(sample) : [],
    };
  }
  console.log(JSON.stringify(out, null, 1));
  await mongoose.disconnect();

  function typeName(p) {
    if (p.instance) return String(p.instance);
    if (p.schema) return 'Embedded[' + (p.schema.paths ? Object.keys(p.schema.paths).length : '?') + ']';
    return String(p);
  }
})();