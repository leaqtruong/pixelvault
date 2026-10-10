# ◈ PixelVault — Game Store (React + Express + MongoDB)

ReactJS SPA + Node.js + Express + MongoDB. Digital key delivery (AES-256-GCM) + toy collectibles, dev portal with revenue, mod hub, community forums, library with playtime + keys, reviews, wishlist, shipping tracking, light/dark themes, editable profiles with address book.

Steam taxonomy: genres / tags / platforms / specials mirror `store.steampowered.com/search` facets — see `lib/steamTaxonomy.js`. Live player counts + community review verdicts come from public Steam Web APIs (`lib/steamLive.js`, 10-min cache).

UI: React SPA. Design tokens and the three layout families live at the top of `client/src/index.css`.

| Family | Pages | Structure |
|---|---|---|
| Catalog Front | home, store, toys | split hero + ledger of real counts, category marquee, special offers as a price table, trending as a numbered index, merch shelf, forum strip |
| Workbench | cart, checkout, orders, library, dev console, key vault, toy shelf | line-item tables, KPI strips, hairline filters, inline editing |
| Long Document | game detail, toy detail, profile | editorial column with a sticky purchase rail |

Header is a single masthead in two tiers (identity row, then one nav row) with no duplicate bar inside the content. Light/dark themes, toast notifications, dark glyphs instead of emoji, and a soft shattering-glass backdrop. Display face is Jersey 25 (Sarah Cadigan-Fried), body is Inter, prices and keys use the mono stack. All frames are square.

Figures shown in the hero ledger are counted from MongoDB on each `/api/home` request — nothing is hardcoded.

## Layout

| Path | What |
|---|---|
| `client/` | ReactJS SPA (Vite). `npm run dev --prefix client` for hot-reload (proxies `/api` to :3000), `npm run build --prefix client` for production |
| `server.js` | Express: serves `/api/*` JSON + `client/dist` static with SPA fallback |
| `routes/api.js` | All JSON endpoints (auth, games, toys, cart, checkout, orders, library, dev, reviews, users, community, mods) |
| `models/` | `Game`, `Toy` (standalone merch collection), `GameKey`, `Order` (`kind: game/toy`), `User`, `Mod`, `Post`, `Review` |
| `seed/` | `import-steam.js` (47 real games), `seed-toys.js` (12 merch), test helpers |

## Run (any machine)

One click: double-click `install-demo.bat` (installs packages, seeds catalog, builds frontend — needs MongoDB running, see below), then `start-website.bat`.

Manual:

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

MongoDB: install MongoDB Community Server (or point `MONGO_URI` at Atlas), make sure it listens on `mongodb://127.0.0.1:27017`. The server also runs with an empty DB (pages show empty states).

### `start-website.bat`

Checks Node, frees port 3000, locates MongoDB, installs packages, builds the frontend, then starts the store and opens the browser.

- **MongoDB discovery** — looks at `MONGOD_EXE`, then `PATH`, then the usual install folders (`C:\Program Files\MongoDB`, `%LOCALAPPDATA%\MongoDB`, `C:\MongoDB`, `D:\`, `E:\`, `F:\MongoDB` and the `MongolDB` spelling) so nothing is hardcoded to one machine. Override with `MONGOD_EXE=<full path to mongod.exe>`; choose the data folder with `MONGOD_DATA=<path>` (defaults to `.mongo-data` beside the repo). If nothing is found it says so and still starts — set `MONGO_URI` in `.env` and run Mongo yourself.
- **Port 3000** — if a previous run is still listening it stops that process, verifies the port actually came free, and fails with a readable message instead of a Node stack trace.
- **Waits** — polls with `ping`, not `timeout`, because `timeout` silently no-ops when stdin is redirected. MongoDB gets 30s to accept connections; port 3000 gets 10s to release.
- **Secret warning** — prints a notice if `.env` still contains the `change-me` placeholders from `.env.example`.

Google login (optional): create an OAuth 2.0 Client ID at `console.cloud.google.com` (Web application, authorized JavaScript origin `http://localhost:3000`), set `GOOGLE_CLIENT_ID` in `.env`, restart. The login page then shows a real "Sign in with Google" button verified server-side.

## Routes (`/api/*` JSON, session-authenticated)

| Mount | What |
|---|---|
| `/api/home` | featured, deals, fresh, toys, category tiles, threads |
| `/api/auth` | register, login, logout, me (session + bcrypt) |
| `/api/games` | Steam-style store: q, genre, tag, platform, feature, sort, maxPrice, onSale, moddable + pager, detail + `keysAvailable`, wishlist |
| `/api/toys` | Separate merch storefront (own collection): q, category, brand, sort + pager, detail + related game, wishlist |
| `/api/cart` | add / qty / remove, mixed digital games + boxed games + toys (`kind` split) |
| `/api/checkout` + `/api/orders` | quote, atomic place order (GameKey.claimOne + stock guards), tax+shipping math, tracking `PV-XXX`, advance scan, order detail shows decrypted demo keys |
| `/api/library` | owned games, play +30min, achievements, delivered keys with copy button, toy library + both wishlists (Games / Collectibles / Wishlist tabs), `/api/recommendations` by genre |
| `/api/dev` | apply, dashboard (gross, 70% cut, monthly, by-country, low-key/low-box alerts), new game, edit game, payout, `/:id/keys` vault (counts, masked list, CSV import, demo generate, revoke), toy shelf restock + price edit |
| `/api/dev/sales` | report view + CSV download of monthly revenue (React page at `/dev/sales`) |
| `/api/mods` | browse, upload by store slug, detail |
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
