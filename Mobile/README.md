# PixelVault Android app

A Kotlin / Jetpack Compose client for the PixelVault API. It talks to the same
`/api/*` endpoints as the React site and can sign the website in by scanning its
QR login code.

## Open it

1. Open this `Mobile` folder in Android Studio.
2. Let Gradle sync (it downloads the wrapper, dependencies and Android SDK 35 on
   the first run).
3. Run the `app` configuration on an emulator or a physical device.

## Point it at the server

The default base URL is `http://10.0.2.2:3000/api/`, which is how the Android
emulator reaches `localhost:3000` on the host machine.

- **Emulator:** keep the default.
- **Physical phone:** the phone must be on the same network as the PC. Change
  `Api.baseUrl` (in `app/src/main/java/com/pixelvault/mobile/api/Api.kt`) to
  `http://<your-pc-lan-ip>:3000/api/`, and make sure Windows Firewall allows
  Node on port 3000.

The backend already permits plain `http` for this dev client (it is not a
browser, so it has no CORS restriction).

## QR login flow

1. On the website login page, tap **Scan to log in**. A QR code appears.
2. In the app, log in normally (or stay logged in), then open **Account →
   Scan web QR to sign in**.
3. Point the camera at the website's code.

The app calls `POST /api/qrlogin/confirm` with its stored session cookie. The
website polls `GET /api/qrlogin/status`, sees `confirmed`, then activates the
handshake and signs itself in.

## What is included

- Email/password login and registration (session cookie is persisted).
- Store browsing, search, genre filter, game detail, add-to-cart, wishlist.
- Cart and checkout (places the order and opens the VNPay URL in the browser).
- Order history and library (owned games + wishlist).
- QR login scanner.

The web-only tools (developer console, admin desk, forums, mods) are not yet in
this first mobile pass; they remain available on the website.
