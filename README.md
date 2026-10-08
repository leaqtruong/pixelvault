# ◈ PixelVault — Game Store (React + Express + MongoDB)

ReactJS SPA + Node.js + Express + MongoDB. Digital key delivery (AES-256-GCM) + toy collectibles, dev portal with revenue, mod hub, community forums, library with playtime + keys, reviews, wishlist, shipping tracking.

Steam taxonomy: genres / tags / platforms / specials mirror `store.steampowered.com/search` facets — see `lib/steamTaxonomy.js`.

## Layout

| Path | What |
|---|---|
| `client/` | ReactJS SPA (Vite). `npm run dev --prefix client` for hot-reload (proxies `/api` to :3000), `npm run build --prefix client` for production |
| `server.js` | Express: serves `/api/*` JSON + `client/dist` static with SPA fallback |
| `routes/api.js` | All JSON endpoints (auth, games, toys, cart, checkout, orders, library, dev, reviews, users, community, mods) |
| `models/` | `Game`, `Toy` (standalone merch collection), `GameKey`, `Order` (`kind: game/toy`), `User`, `Mod`, `Post`, `Review` |
| `seed/` | `import-steam.js` (47 real games), `seed-toys.js` (12 merch), test helpers |

## Run

```powershell
cd pixelvault
copy .env.example .env   # set MONGO_URI + KEY_ENCRYPTION_SECRET
npm install
npm install --prefix client
node seed/import-steam.js  # 47 real games from local Steam manifests + Store API, ~390 DEMO keys
node seed/seed-toys.js     # 12 official merch listings into standalone `toys` collection — safe to re-run
npm run build --prefix client  # build React frontend
npm run dev            # http://localhost:3000 (or double-click start-website.bat)
```

## Routes (`/api/*` JSON, session-authenticated)

| Mount | What |
|---|---|
| `/api/home` | featured, deals, fresh, toys, category tiles, threads |
| `/api/auth` | register, login, logout, me (session + bcrypt) |
| `/api/games` | Steam-style store: q, genre, tag, platform, feature, sort, maxPrice, onSale, moddable + pager, detail + `keysAvailable`, wishlist |
| `/api/toys` | Separate merch storefront (own collection): q, category, brand, sort + pager, detail + related game, wishlist |
| `/api/cart` | add / qty / remove, mixed digital games + boxed games + toys (`kind` split) |
| `/api/checkout` + `/api/orders` | quote, atomic place order (GameKey.claimOne + stock guards), tax+shipping math, tracking `PV-XXX`, advance scan, order detail shows decrypted demo keys |
| `/api/library` | owned games, play +30min, achievements, delivered keys grouped by game, toy library + wishlists, `/api/recommendations` by genre |
| `/api/dev` | apply, dashboard (gross, 70% cut, monthly, by-country), new game, payout, `/:id/keys` vault (counts, CSV import, demo generate), toy restock |
| `/api/mods` | browse, detail |
| `/api/community` | boards, post detail, new post, replies |
| `/api/reviews` | own-to-review, helpful votes, dev response |
| `/api/users/:username` | profile, library preview, own orders |

## Run

```powershell
cd pixelvault
copy .env.example .env   # set MONGO_URI + KEY_ENCRYPTION_SECRET
npm install
npm install --prefix client
node seed/import-steam.js  # 47 real games from local Steam manifests + Store API, ~390 DEMO keys
node seed/seed-toys.js     # 12 official merch listings into standalone `toys` collection — safe to re-run
npm run build --prefix client  # build React frontend
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

`users` (game library + toyLibrary, wishlists, addresses, playHistory), `games` (genres/tags/platforms/features Steam-style + digital + physical subdoc, stats.keysAvailable), `toys` (standalone merch: brand, category, price, stock), `gamekeys` (codeEnc AES-256-GCM, codeHash unique, status, order, user), `orders` (items.kind game/toy, keyIds, shipment, devPayouts), `mods`, `posts` (replies embedded), `reviews`.
