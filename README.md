# ◈ PixelVault — Game Store (React + Express + MongoDB)

ReactJS SPA + Node.js + Express + MongoDB. Digital key delivery (AES-256-GCM) + toy collectibles, dev portal with revenue, mod hub, community forums, library with playtime + keys, reviews, wishlist, shipping tracking, light/dark themes, editable profiles with address book.

Steam data (title, capsule art, genres, price, platforms, release date) comes from the Steam Store API. Live player counts and community review verdicts come from public Steam Web APIs (`lib/steamLive.js`, 10-min cache).

**Catalog** — 74 titles, grown from four batches of appids. Titles that should not be listed are filtered out at import: demos, DLC, playtests, videos, episodes, hardware and unreleased entries are all rejected from the Store API's own `type` and `release_date` fields. One caveat is documented in `seed/block-titles.js`: `content_descriptors.ids` comes back from this endpoint as empty objects, so the mature-content flags cannot be read programmatically and that list is curated by hand.

**System requirements** are mirrored per title from `pc_requirements` / `mac_requirements` / `linux_requirements`, minimum and recommended, parsed by `seed/steamReq.js`. The catalog no longer invents a "GTX 1060 / 8 GB RAM" line for every game. The detail page renders it as a platform table with the verbatim spec lines behind a disclosure.

**Cover art** — the Store API's `header_image` is a 460×215 banner, which renders soft in the card grid on a hi-dpi screen. `seed/steamArt.js` probes for the larger assets Steam publishes (`library_600x900_2x` at 600×900 for portraits, `library_hero` at 1920×620 for the wide hero) and falls back through a chain, keeping the original banner only for the two titles that have nothing else.

**Where the numbers come from.** Nothing on the storefront is invented:

| Shown | Source |
|---|---|
| Title, studio, genres, price, discount, release date, platform list | Steam Store API |
| System requirements (minimum + recommended, per OS) | Steam `pc_requirements` / `mac_requirements` / `linux_requirements` |
| Cover and hero art | Steam CDN, largest asset that exists for that appid |
| Feature categories | Steam `categories`, filtered to the ones a buyer filters on |
| Player counts, review verdicts, news | Steam Web API, cached 10 minutes |
| Mod titles, descriptions, tags, file sizes, subscriber/favourite/view/vote counts, star ratings, author names | Steam Workshop (`steamcommunity.com/workshop/browse/`), mirrored by `seed/import-workshop.js` |
| Ledger counts, stock, order totals, revenue | Counted from MongoDB on request |
| Shipping cost | **Sample rates** from `.env` — labelled as such on the checkout screen, not a carrier tariff |
| Tax rate | `TAX_RATE` from `.env` |

Where Steam publishes nothing, the field stays unset and the UI says so rather than showing a plausible-looking placeholder. Install size, version string and ESRB rating are not available from the API, so they are never invented — a fabricated rating would also silently defeat the "hide mature titles" preference, which reads that field.

**Store filters** are built from what the catalog actually contains: genres, Steam feature categories (Single-player, Co-op, Steam Achievements, Steam Workshop, VR Supported…), platforms, price bands and five sort orders.

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
| `seed/` | `import-steam.js` (full reseed of the baseline catalog), `import-more.js` (adds missing appids, `--rebuild` restores a wiped catalog), `enrich-steam.js` (real system requirements, publishers, languages, Steam categories), `upgrade-covers.js` (high-res art pass), `strip-invented-data.js` (clears placeholder fields written by older imports), `check-db-health.js` (15-point database health check: connection, collections, indexes, API-versus-database agreement, write-and-read-back), `steamArt.js` / `steamReq.js` / `seed-reviews.js` / `seed-toys.js` / `block-titles.js` / `prune-catalog.js` / `find-mongo.js` (mongod discovery) / `check-db.js` (catalog verification) / `rotate-key-secret.js` (secret migration) / `reset-demo.js`, `clear-orders.js` |

`npm run seed` chains the real importers. There is no longer a seeder that fabricates a fictional catalog — an earlier `seed/seed.js` invented titles, prices and install sizes and was wired to that script; it was removed rather than kept as a trap.

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

## Deploying to Render

`render.yaml` is a Render blueprint: New → Blueprint → point at the repository. The values it sets are:

| Setting | Value | Why |
|---|---|---|
| Build command | `npm ci --include=dev && npm ci --prefix client --include=dev && npm run build --prefix client` | the server serves `client/dist`, so the SPA must be built first. `--include=dev` is required: `NODE_ENV=production` makes npm skip devDependencies, and vite — the tool that builds the client — is one of them |
| Start command | `node server.js` | |
| Health check | `/api/health` | answers even while MongoDB is still connecting |
| `NODE_ENV` | `production` | marks session cookies `secure` |
| `MONGO_URI` | *paste your own* | see below |
| `SESSION_SECRET`, `KEY_ENCRYPTING_SECRET` | *generated by Render* | never commit these |

**MongoDB is not provided by Render's free tier.** The filesystem is ephemeral, so a database started as a file inside the service is wiped on every deploy and every spin-down. Use MongoDB Atlas — the free M0 cluster (512 MB) is more than this catalog needs — or a paid Render MongoDB instance, and paste the connection string into `MONGO_URI`.

**Populating it.** A fresh deployment has an empty catalog. Run the importers once against the deployed database:

```
$env:MONGO_URI='mongodb+srv://...'; node seed/import-steam.js
$env:MONGO_URI='mongodb+srv://...'; node seed/import-workshop.js --apply
```

Render's servers can reach Steam, unlike some networks where it is blocked.

### Two things that were broken before deployment

`req.protocol` is used to build the payment gateway's return URL. Render terminates TLS and forwards the request, so without `app.set('trust proxy', 1)` Express sees `http` and hands the shopper a downgraded redirect on an https site. The setting is in `server.js`.

Sessions used the default in-memory store. Memory lives in the process, so every deploy and every automatic spin-down after fifteen idle minutes signs everyone out. `lib/mongoSessionStore.js` keeps them in MongoDB instead, with a TTL index so expired rows are removed by Mongo itself. `node seed/check-session.js` signs in, restarts the server, and confirms the same cookie still works.

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

## Mods: mirrored from the Steam Workshop, with the source recorded

The Workshop page is not fiction and nothing here was written by hand. Mods are mirrored from Valve's public Steam Workshop, and **every row records where it came from and when**:

| Field | Meaning | Source |
|---|---|---|
| `source.provider` | `steam-workshop` (absent for PixelVault uploads) | — |
| `source.id` | the Workshop `publishedfileid` | Steam |
| `source.url` | `https://steamcommunity.com/sharedfiles/filedetails/?id=…` | constructed from the id |
| `source.author` | the author's public Steam name | breadcrumb on the item's own page |
| `source.authorId` | `steamid64`, exactly as Steam reports it | Steam |
| `source.gameUrl` | the Workshop page of the parent game | constructed from the game's appid |
| `source.retrievedAt` | when this row was mirrored | this importer |
| `mirror.subscriptions` / `favorites` / `views` / `votes` / `rating` / `comments` | Steam's own counts | Steam |
| `mirror.fileSize` | bytes, as Steam reports it | Steam |
| `mirror.createdAt` / `updatedAt` | Steam's timestamps | Steam |

`version` is deliberately **unset** for mirrored mods — Steam publishes no version string for a Workshop item, and a made-up `1.0.0` would look like a real fact. The detail page says so instead. PixelVault does not host any mod files; the download button links back to Steam.

Only the 21 catalog titles that actually publish Workshop content are eligible. The other 53 have none, and the importer records that rather than inventing entries — Terraria alone publishes 150,859 items, Garry's Mod 1,991,172.

```
node seed/import-workshop.js                  dry run, browse phase only
node seed/import-workshop.js --apply          write mods to MongoDB
node seed/import-workshop.js --apply --pages 3
node seed/import-workshop.js --apply --authors --limit 200
node seed/workshop-status.js                  what has been mirrored so far
```

`--apply` upserts on the Workshop item id, so running it repeatedly only adds what is missing and refreshes the Steam counts on rows it already has. Author names are never overwritten once resolved.

Importing is split into two phases on purpose. Steam answers `HTTP 429` under load, so the browse phase makes only a handful of requests, and the author-name lookup runs separately at a slower pace and skips rows that already have a name — interrupt it and re-run, and it continues where it stopped. A unique index on `('source.provider', 'source.id')` makes re-imports idempotent.

The importer never reports a game it could not reach as a game with no Workshop. A throttled request, an unreachable host and a genuine absence are three different outcomes, and collapsing them would quietly shrink the catalog while reporting success. Failures are listed by name so a re-run can pick them up.

**Networking note.** On some networks every Steam hostname resolves to `127.0.0.1` (seen on a machine in Vietnam using `8.8.8.8`, while GitHub, npm and the Nexus API resolve normally), and on others the TLS connection to Steam's real addresses is reset outright. `lib/steamFetch.js` handles the first case: when plain `fetch` fails for a Steam host, it resolves the hostname over DNS-over-HTTPS and connects straight to the returned address, keeping the original `Host` header and TLS SNI. It tries ordinary `fetch` first on purpose — the workaround only engages when the normal path fails. If Steam is blocked at the TCP/TLS layer as well, no client-side change helps; the importer reports `unreachable (ECONNRESET…)` and the affected games, and re-running later resumes exactly where it stopped.

Other sources were evaluated and rejected: the Nexus Mods API answers `401` and its site `403` without credentials, and CurseForge's API returns `403: API Key missing or invalid`. Steam's own `ISteamRemoteStorage/GetPublishedFileDetails` needs an API key to be useful. The Workshop browse page is public, needs no key, and ships the data as server-rendered JSON.

`users` (game library + toyLibrary, wishlists, addresses, playHistory), `games` (genres/tags/platforms/features Steam-style + digital + physical subdoc, stats.keysAvailable), `toys` (standalone merch: brand, category, price, stock), `gamekeys` (codeEnc AES-256-GCM, codeHash unique, status, order, user), `orders` (items.kind game/toy, keyIds, shipment, devPayouts), `mods` (`source` provenance + `mirror` Steam figures for Workshop entries), `posts` (replies embedded), `reviews`.
