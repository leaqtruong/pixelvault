// Seed REAL toy/merch listings into the standalone Toy collection.
// Names, brands, prices and images mirrored from official stores
// (Fangamer, Youtooz, NECA, Toynk/Jazwares) for coursework illustration.
// Upsert by sku — safe to re-run. Also removes legacy toy docs that used
// to live inside the Game collection before the split.
require('dotenv').config();
const mongoose = require('mongoose');
const Game = require('../models/Game');
const Toy = require('../models/Toy');

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pixelvault';

const TOYS = [
  { sku: 'PV-TOY-001', title: 'Hornet Plush', brand: 'Fangamer (official Hollow Knight)', price: 32.00, category: 'Plush', material: 'Plush + magnets', size: '30cm+', relatedAppId: 367520, img: 'https://cdn.shopify.com/s/files/1/0014/1962/products/product_HK_hornet_plush_designview_365bd8b0-2050-46a4-820b-fc687c790d1a.png?v=1557108214', src: 'https://www.fangamer.com/products/hollow-knight-hornet-plush', blurb: 'Official Hornet plush prototyped by Saber Murphy and Eyes5. Includes a plush needle that attaches with magnets.' },
  { sku: 'PV-TOY-002', title: 'Hornet Mini Figurine', brand: 'Fangamer (official Hollow Knight)', price: 15.00, category: 'Figure', material: 'PVC', size: '~8cm', relatedAppId: 367520, img: 'https://cdn.shopify.com/s/files/1/0014/1962/products/product_HK_mini_figurines_hornet_designview.png?v=1661370638', src: 'https://www.fangamer.com/products/hornet-figurine-mini', blurb: 'Mini Hornet figurine from the official Hollow Knight mini-figurine line. Desk-ready defender of Hallownest.' },
  { sku: 'PV-TOY-003', title: 'Hornet Resin Statue', brand: 'Fangamer (official Hollow Knight)', price: 38.00, category: 'Statue', material: 'Resin', size: '~15cm', relatedAppId: 367520, img: 'https://cdn.shopify.com/s/files/1/0014/1962/products/product_HK_hornet_resin_statue_designview_56138d49-52ad-4308-835d-a4f21665c3b9.png?v=1677082390', src: 'https://www.fangamer.com/products/hollow-knight-hornet-resin-statue', blurb: 'Collector resin statue of Hornet, protector of Hallownest. Official Fangamer merchandise.' },
  { sku: 'PV-TOY-004', title: 'Terraria Deluxe Skeletron Figure Pack', brand: 'Jazwares (official Terraria)', price: 39.99, category: 'Figure', material: 'PVC', size: '3-inch scale', relatedAppId: 105600, img: 'https://cdn.shopify.com/s/files/1/1140/8354/products/JZW-13617-CA.jpg?v=1647631784', src: 'https://www.toynk.com/products/terraria-deluxe-action-figure-pack-skeletron', blurb: 'Deluxe Skeletron action figure pack from the official Jazwares Terraria toy line.' },
  { sku: 'PV-TOY-005', title: 'Terraria Bunny 7" Plush', brand: 'Jazwares (official Terraria)', price: 27.99, category: 'Plush', material: 'Plush', size: '7 inch', relatedAppId: 105600, img: 'https://cdn.shopify.com/s/files/1/1140/8354/products/JZW-13658-CA.jpg?v=1647630980', src: 'https://www.toynk.com/search?q=terraria+bunny+plush', blurb: 'The iconic Terraria Bunny as a soft 7-inch plush. Creeper-proof (probably).' },
  { sku: 'PV-TOY-006', title: 'Terraria Toxic Sludge 7" Plush', brand: 'Jazwares (official Terraria)', price: 23.99, category: 'Plush', material: 'Plush', size: '7 inch', relatedAppId: 105600, img: 'https://cdn.shopify.com/s/files/1/1140/8354/products/JZW-13659-CA.jpg?v=1647636564', src: 'https://www.toynk.com/search?q=terraria+sludge+plush', blurb: 'Toxic Sludge plush — all of the charm, none of the debuff.' },
  { sku: 'PV-TOY-007', title: 'Terraria Goblin Tinkerer 3" Figure', brand: 'Jazwares (official Terraria)', price: 29.99, category: 'Figure', material: 'PVC', size: '3 inch', relatedAppId: 105600, img: 'https://cdn.shopify.com/s/files/1/1140/8354/products/JZW-13603-CA.jpg?v=1647631073', src: 'https://www.toynk.com/search?q=goblin+tinkerer', blurb: 'Goblin Tinkerer 3-inch figure. Reforges not included.' },
  { sku: 'PV-TOY-008', title: 'Risk of Rain 2 Engineer Plush (9")', brand: 'Youtooz (official RoR2)', price: 29.99, category: 'Plush', material: 'Plush', size: '9 inch', relatedAppId: 632360, img: 'https://cdn.shopify.com/s/files/1/0160/2840/1712/files/7p6l1d116e.png?v=1763072401', src: 'https://youtooz.com/collections/risk-of-rain-2', blurb: 'Engineer 9-inch plush from the official Youtooz x Risk of Rain 2 collection. Turrets not included.' },
  { sku: 'PV-TOY-009', title: 'Risk of Rain 2 Commando Plush (9")', brand: 'Youtooz (official RoR2)', price: 29.99, category: 'Plush', material: 'Plush', size: '9 inch', relatedAppId: 632360, img: 'https://cdn.shopify.com/s/files/1/0160/2840/1712/files/41h376557q.png?v=1763072533', src: 'https://youtooz.com/collections/risk-of-rain-2', blurb: 'Commando 9-inch plush. The first survivor, now huggable.' },
  { sku: 'PV-TOY-010', title: 'Risk of Rain 2 Enamel Pin Set', brand: 'Youtooz (official RoR2)', price: 29.99, category: 'Pins', material: 'Enamel', size: '2 inch each', relatedAppId: 632360, img: 'https://cdn.shopify.com/s/files/1/0160/2840/1712/files/4e5m7p4t3l.png?v=1762268662', src: 'https://youtooz.com/products/risk-of-rain-2-pin-set', blurb: 'Set of 5 unique 2-inch enamel pins. Legendary loot for your jacket.' },
  { sku: 'PV-TOY-011', title: 'Team Fortress 2 RED Medic 7" Figure', brand: 'NECA (official TF2)', price: 39.99, category: 'Figure', material: 'PVC', size: '7 inch', relatedAppId: 440, img: 'https://cdn.shopify.com/s/files/1/1227/0654/files/45072_Gallery-Medic1.jpg?v=1784933093', src: 'https://store.necaonline.com/', blurb: 'RED Medic 7-inch action figure, Series 4. Official NECA x Team Fortress 2. Overheal not included.' },
  { sku: 'PV-TOY-012', title: 'Limbus Company Dante Clock Figure', brand: 'Goods Republic (official JP merch)', price: 25.99, category: 'Figure', material: 'PVC', size: '~11cm', relatedAppId: 1973530, img: null, src: 'https://goodsrepublic.com/', blurb: 'Dante clock-head desk figure from the official Japanese Limbus Company goods lineup. Cover uses franchise art as illustration; demo listing for coursework.' },
];

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  await mongoose.connect(MONGO);
  console.log('[toys] connected');
  try { await Toy.syncIndexes(); } catch {}

  // Legacy cleanup: toys used to live in games collection pre-split.
  const legacy = await Game.deleteMany({ productType: 'toy' });
  if (legacy.deletedCount) console.log(`[toys] removed ${legacy.deletedCount} legacy game-docs`);

  const limbus = await Game.findOne({ steamAppId: 1973530 }).lean();
  let n = 0;
  for (const [i, t] of TOYS.entries()) {
    const related = t.relatedAppId ? await Game.findOne({ steamAppId: t.relatedAppId }).lean() : null;
    const doc = {
      title: t.title,
      slug: `${slugify(t.title)}-${t.sku.toLowerCase()}`,
      tagline: `${t.brand} — related: ${related?.title || 'various'}`,
      description: `${t.blurb}\n\nOfficial merchandise mirrored from ${t.brand} for coursework illustration (price/image reference, demo listing). Ships as a physical parcel with tracking.`,
      brand: t.brand, category: t.category, material: t.material, size: t.size, age: '15+',
      price: t.price,
      stock: 25 + ((i * 11) % 40),
      weightLb: 1.2, warehouse: i % 2 ? 'US-WEST' : 'US-EAST',
      includes: ['Collectible', 'Display box'],
      coverImage: t.img || limbus?.coverImage || '',
      screenshots: t.img ? [t.img] : [],
      sourceUrl: t.src, relatedAppId: t.relatedAppId,
      status: 'published',
    };
    await Toy.findOneAndUpdate(
      { title: t.title, brand: t.brand },
      { $set: doc, $setOnInsert: { stats: { views: 200 + i * 31, unitsSold: 5 + i * 2, revenueGross: 200 + i * 90, reviewSum: 0, reviewCount: 0 } } },
      { upsert: true }
    );
    n++;
    console.log(`[toys] upsert ${t.title} $${t.price}`);
  }
  console.log(`[toys] done: ${n} merch listings in toys collection`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
