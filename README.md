# ◈ PixelVault — Steam-like Game Store

Node.js + Express + EJS + MongoDB. Digital key delivery (AES-256-GCM) + physical sales, dev portal with revenue, mod hub, community forums, library with playtime + keys, reviews, wishlist, shipping tracking.

Steam taxonomy: genres / tags / platforms / specials mirror `store.steampowered.com/search` facets — see `lib/steamTaxonomy.js`.

## Routes (16 groups, 40+ endpoints)

| Mount | What |
|---|---|
| `GET /` | Landing: featured, deals, fresh, tavern chatter |
| `/auth` | register, login, logout (session + bcrypt) |
| `/games` | Steam-style store: q, genre, tag, platform, feature, sort, maxPrice, onSale, moddable + pager, detail + `keysAvailable`, wishlist |
| `/toys` | Separate merch storefront (own collection): q, category, brand, sort + pager, detail + related game, wishlist |
| `/cart` | add / qty / remove, mixed digital games + boxed games + toys (`kind` split) |
| `/checkout` + `/orders` | quote, atomic place order (GameKey.claimOne + physical stock guard), tax+shipping math, tracking `PV-XXX`, advance scan, order detail shows decrypted demo keys |
| `/library` | owned games, play +30min, achievements, delivered keys grouped by game, `/recommendations` by genre |
| `/dev` | apply, dashboard (gross, 70% cut, monthly, by-country, chart.js), new/edit game, payout, `/:id/keys` vault (counts, CSV import, demo generate) |
| `/mods` | browse, upload, download counter, endorse, comments |
| `/community` | boards, per-game threads, new post, replies, likes |
| `/reviews` | own-to-review, helpful votes, dev response |
| `/users/:username` | profile, bio, library preview, orders |
| `GET /api/stats` | JSON health for widgets |

## Run

```powershell
cd pixelvault
copy .env.example .env   # set MONGO_URI + KEY_ENCRYPTION_SECRET
npm install
node seed/import-steam.js  # 47 real games from local Steam manifests + Store API, ~390 DEMO keys
node seed/seed-toys.js     # 12 official merch listings into standalone `toys` collection — safe to re-run
# or: npm run seed         # fallback: 100 fictional demo games
npm run dev            # http://localhost:3000
```

Seed logins: `gamer@vault.gg` / `dev@neonforge.gg` / `mods@vault.gg` — password `password123`.

Demo keys are fake `DEMO-XXXXX-XXXXX-XXXXX` placeholders encrypted with AES-256-GCM (`lib/keyCrypto.js`). Not real Steam keys — coursework only. Restock in Dev console → Keys.

## Key delivery model (race-safe)

- `GameKey { game, codeEnc, codeHash unique, status: available|sold|revoked, order, user }` + index `{game:1,status:1}`.
- Checkout claims via `findOneAndUpdate({game,status:available})` — 2 buyers can't get same key.
- Physical stock uses `findOneAndUpdate({_id, stock:{$gte:qty}}, $inc:-qty)` + rollback on failure.
- `Game.stats.keysAvailable/keysSold` cached for fast store badges.

## Shipping model

- `standard`: $4.99 + $0.5/lb, free over $75 · `express`: $14.99 + $1.2/lb · `overnight`: $29.99 + $1.8/lb
- Tax 8%. Tracking `PV-<base36><rand>`. Status flow: packing → shipped → in_transit → out_for_delivery → delivered.
- Dev cut 70% credited to `devProfile.balanceOwed` per order item; payout resets at $10 min.

## MongoDB collections

`users` (library entries, wishlist, addresses, playHistory), `games` (genres/tags/platforms/features Steam-style + digital + physical subdoc, stats.keysAvailable), `gamekeys` (codeEnc AES-256-GCM, codeHash unique, status, order, user), `orders` (items.keyIds, shipment, devPayouts), `mods`, `posts` (replies embedded), `reviews`.
