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
| `seed/` | `import-steam.js` (47 real games), `seed-toys.js` (12 merch), `find-mongo.js` (mongod discovery for the launcher), `check-db.js` (catalog verification), `rotate-key-secret.js` (secret migration), test helpers |

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

Checks Node, frees port 3000, locates and starts MongoDB, installs packages, verifies the catalog, builds the frontend, then starts the store and opens the browser.

- **MongoDB discovery** — `seed/find-mongo.js` does the probing: `MONGOD_EXE`, then `PATH`, then the usual install folders (`C:\Program Files\MongoDB`, `%LOCALAPPDATA%\MongoDB`, `C:\MongoDB`, `D:\`, `E:\MongoDB`, `E:\MongolDB`, `F:\MongoDB`, plus `<repo>\mongodb`). It accepts only a real `mongod.exe` binary — a naive recursive scan once returned MongoDB Compass's folder instead. Override with `MONGOD_EXE=<full path>`.
- **Data folder** — picked by walking up from the discovered binary for an existing `data\db`, so an existing install is reused rather than silently booting a brand-new empty database. Override with `MONGOD_DATA=<path>`. If nothing is found the launcher says so and still starts; set `MONGO_URI` in `.env` and run Mongo yourself.
- **Catalog verification** — `seed/check-db.js` prints the real counts before the server boots (`47 games · 12 toys · 391 keys`) and tells you which seed command to run if the database is empty, so an empty storefront is never silent.
- **Database gate** — while MongoDB is still connecting the API answers `503` instead of letting Mongoose buffer queries and crash the process with `buffering timed out`. The SPA shows a "Connecting to MongoDB" boot screen and polls until it answers.
- **Port 3000** — if a previous run is still listening it stops that process, verifies the port actually came free, and fails with a readable message instead of a Node stack trace.
- **Waits** — polls with `ping`, not `timeout`, because `timeout` silently no-ops when stdin is redirected. MongoDB gets 30s to accept connections; port 3000 gets 10s to release.

### MongoDB without the launcher

**A Windows service named `PixelVault MongoDB` is registered on this machine** (`Running`, start type `Automatic`, dbpath `E:\MongolDB\data\db`). MongoDB therefore starts with Windows, before anyone signs in, and `start-website.bat` simply finds port 27017 already answering and moves on. Manage it from an elevated shell:

```powershell
Get-Service "PixelVault MongoDB"
Start-Service "PixelVault MongoDB"
Stop-Service  "PixelVault MongoDB"
```

Server output goes to `E:\MongolDB\data\mongod-service.log`. `mongod --install` refuses to run without `--logpath`, so any reinstall needs it.

To uninstall:

```powershell
Stop-Service "PixelVault MongoDB"
& "E:\MongolDB\mongodb-win32-x86_64-windows-8.3.8\bin\mongod.exe" --remove --serviceName "PixelVault MongoDB"
```

On a machine without the service, `start-website.bat` starts MongoDB itself. `start-mongodb-only.bat` is the standalone fallback — it exits immediately when port 27017 is already taken, so it is safe to run twice and never spawns a second `mongod`. It writes to `.mongo-logs/mongod.log` rather than holding a console window open.

To register the service on a different machine, from an elevated PowerShell:

```powershell
& "<path to>\mongod.exe" --install --serviceName "PixelVault MongoDB" `
  --dbpath "<path to>\data\db" --logpath "<path to>\data\mongod-service.log"
Start-Service "PixelVault MongoDB"
```

## Secrets

`.env` holds `SESSION_SECRET` (signs the session cookie) and `KEY_ENCRYPTION_SECRET` (derives the AES-256-GCM key that encrypts every stored game key). `.env.example` ships placeholders; `start-website.bat` warns while they are still in place.

Rotating `KEY_ENCRYPTION_SECRET` by hand orphans the key inventory: every `GameKey` row is `iv.tag.cipher` sealed under the old secret, so the first purchase after a naive swap fails to decrypt. Use the migration instead:

```powershell
$env:OLD_KEY_ENCRYPTION_SECRET = '<current value>'
$env:NEW_KEY_ENCRYPTION_SECRET = '<new value, 32+ chars>'
node seed/rotate-key-secret.js            # dry run: reports the plan
node seed/rotate-key-secret.js --apply    # re-encrypts and updates .env
```

It decrypts every row with the old secret, verifies a round trip, aborts without writing if any row is unreadable, and rewrites `.env` only after the data is confirmed good. Changing `SESSION_SECRET` just signs everyone out.

## Robustness

Every async route handler is wrapped so a rejected promise becomes a JSON error instead of an unhandled rejection — Express 4 does not do this on its own, and a single bad id such as `/api/orders/garbage` used to kill the whole server. While MongoDB is still connecting the API answers `503` rather than letting Mongoose buffer queries; the SPA shows a "Connecting to MongoDB" screen and polls until the database answers.
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
