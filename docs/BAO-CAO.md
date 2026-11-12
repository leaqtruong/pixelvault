# BÁO CÁO ĐỒ ÁN — PIXELVAULT

PixelVault là cửa hàng game số + merch vật lý, gồm React SPA, Node/Express API, MongoDB, thanh toán VNPay sandbox và app Android Kotlin. Tài liệu này trình bày cơ sở dữ liệu (biểu đồ class, dữ liệu trong database) và từng chức năng (giao diện + luồng xử lý).

---

# PHẦN 1 — CƠ SỞ DỮ LIỆU

## 1.1 Tổ chức dữ liệu

- Hệ quản trị: **MongoDB**, truy cập qua **Mongoose** (database `pixelvault`).
- Dữ liệu nghiệp vụ nằm trong 10 collection: `users`, `games`, `toys`, `gamekeys`, `orders`, `payments`, `posts`, `reviews`, `qrlogins`, `payouts`.
- Ngoài ra: GridFS `images.files` / `images.chunks` (ảnh game, toy).
- Quan hệ dùng `ObjectId` + `ref`; dữ liệu con (thư viện, địa chỉ, item đơn hàng, reply) được nhúng trực tiếp trong document cha.

## 1.2 Biểu đồ class

```mermaid
classDiagram
  direction LR

  class User {
    ObjectId _id
    string username
    string email
    string passwordHash
    string role
    boolean isBanned
    List~ObjectId~ wishlist
    List~ObjectId~ toyWishlist
    List~LibraryEntry~ library
    List~ToyEntry~ toyLibrary
    List~Address~ addresses
    List~ObjectId~ purchaseHistory
    DevProfile devProfile
    Preferences preferences
  }

  class Game {
    ObjectId _id
    string title
    string slug
    ObjectId developer
    string studioName
    List~string~ genres
    List~string~ tags
    List~string~ platforms
    number price
    number discountPct
    number steamAppId
    Physical physical
    SystemReq systemReq
    List~Language~ languageList
    GameStats stats
    string status
  }

  class Toy {
    ObjectId _id
    string title
    string slug
    string brand
    string category
    number price
    number stock
    number weightLb
    ObjectId seller
    string status
  }

  class GameKey {
    ObjectId _id
    ObjectId game
    string platform
    string region
    string source
    string codeEnc
    string codeHash
    string status
    ObjectId order
    ObjectId user
    Date soldAt
  }

  class Order {
    ObjectId _id
    ObjectId user
    List~OrderItem~ items
    number subtotal
    number tax
    number shippingTotal
    number grandTotal
    string status
    Date paidAt
    PaymentInfo payment
    Shipment shipment
    List~DevPayout~ devPayouts
  }

  class Payment {
    ObjectId _id
    string orderId
    string gatewayOrderId
    ObjectId user
    ObjectId order
    number amount
    string currency
    string provider
    boolean live
    string status
    string responseCode
    Mixed rawCallback
    Date settledAt
  }

  class Review {
    ObjectId _id
    ObjectId game
    ObjectId user
    number stars
    string title
    string body
    List~ObjectId~ helpful
    DevResponse devResponse
  }

  class Post {
    ObjectId _id
    string board
    ObjectId game
    string title
    string body
    ObjectId author
    List~Reply~ replies
    boolean pinned
  }

  class QrLogin {
    ObjectId _id
    string token
    string status
    ObjectId user
    Date createdAt
  }

  class Payout {
    ObjectId _id
    ObjectId developer
    number amount
    string status
    Date requestedAt
    Date paidAt
    string note
  }

  User "1" --> "*" Game : developer
  User "1" --> "*" Order : buyer
  User "1" --> "*" Review : writes
  User "1" --> "*" Post : authors
  User "1" --> "*" Toy : owns / wishes
  User "1" --> "*" Payout : requests
  Game "1" --> "*" GameKey : issued for
  Game "1" --> "*" Review : receives
  Game "0..1" <-- "*" Post : discusses
  Order "1" --> "*" GameKey : delivers
  Order "1" --> "*" Payment : paid by
```

## 1.3 Mô tả các collection

### users
| Nhóm trường | Nội dung |
|---|---|
| Định danh | `username` (unique), `email` (unique), `passwordHash` (bcrypt, `select:false`) |
| Hồ sơ | `displayName`, `phone`, `avatar`, `bio`, `role` (`user`/`developer`/`admin`), `isBanned` |
| Thư viện | `library[]` (game, edition, purchasedAt, playMinutes, achievements), `toyLibrary[]` (toy, qty) |
| Mong muốn | `wishlist[]`, `toyWishlist[]` |
| Giao hàng | `addresses[]` (label, fullName, street, city, region, postal, country, phone) |
| Lịch sử | `playHistory[]`, `purchaseHistory[]` |
| Dev | `devProfile` (studioName, website, payoutEmail, verified, balanceOwed) |
| Tùy chọn | `preferences.favoriteGenres`, `preferences.matureFilter` |

### games
| Nhóm trường | Nội dung |
|---|---|
| Thông tin | `title`, `slug` (unique), `tagline`, `description`, `developer` (ref User), `studioName`, `publisher` |
| Phân loại | `genres[]`, `tags[]`, `platforms[]`, `features[]`/`categories[]`, `contentWarnings[]` |
| Giá | `price`, `discountPct` (0–90), `physical` (enabled, price, stock, weightLb, warehouse) |
| Kỹ thuật số | `steamAppId` (mã nguồn tham chiếu), `digitalSku`, `systemReq` (minimum/recommended/lines/specs), `languages`, `languageList[]`, `deckVerified` |
| Media | `coverImage`, `screenshots[]` (URL `/api/media/<id>` từ GridFS) |
| Thống kê | `stats.views/unitsDigital/unitsPhysical/revenueGross/reviewSum/reviewCount/keysSold` |
| Trạng thái | `status` (`draft`/`pending`/`published`/`delisted`), `featured`, `releaseDate` |

### toys
`title`, `slug`, `brand`, `category` (Plush/Figure/Statue/Apparel/Book/Music/Pins/Other), `material`, `size`, `age`, `price`, `stock`, `weightLb`, `warehouse`, `includes[]`, `coverImage`, `screenshots[]`, `relatedAppId`, `status`, `seller` (ref User), `stats`.

### gamekeys
`game` (ref Game), `platform` (Steam/Epic/GOG/PixelVault), `region`, `source` (`supplier`/`demo`), `codeEnc` (AES-256-GCM `iv.tag.cipher`), `codeHash` (SHA-256, **unique**), `status` (`sold`/`revoked`), `order`, `user`, `soldAt`. Không có trạng thái "available": key chỉ sinh ra lúc đơn được fulfilment.

### orders
`user`, `items[]` (kind game/toy, game/toy ref, title, edition digital/physical, unitPrice, qty, weightLb, keyIds[]), `subtotal`, `tax`, `shippingTotal`, `grandTotal`, `status` (pending/paid/failed/fulfilled/shipped/delivered/cancelled), `paidAt`, `payment.method`, `shipment` (tracking, carrier, method, cost, address, status), `devPayouts[]`.

### payments
`orderId` + `gatewayOrderId` (unique), `user`, `order`, `amount` (VND), `currency`, `provider` (`vnpay`/`sandbox`), `live`, `status` (pending/success/failed), `responseCode`, `gatewayTransactionNo`, `rawCallback` (nguyên payload gateway), `settledAt`.

### posts
`board` (general/lfg/guides/support/deals/game), `game` (optional), `title`, `body`, `author` (ref User), `tags[]`, `pinned`, `locked`, `views`, `likes[]`, `replies[]` (user, text, likes, createdAt).

### reviews
`game` (ref Game), `user` (ref User), `stars` (1–5), `title`, `body`, `playMinutesAtReview`, `helpful[]`, `devResponse` (text, respondedAt). Unique index `(game, user)` — mỗi người chỉ đánh giá một lần.

### qrlogins
`token` (unique), `status` (pending/confirmed), `user`, `createdAt` (TTL 90 giây).

### payouts
`developer` (ref User), `amount`, `status` (`pending`/`paid`/`rejected`), `requestedAt`, `paidAt`, `note`. Khi developer gửi yêu cầu, số dư hiển thị được đưa về 0 để không thể yêu cầu hai lần; admin duyệt `paid` hoặc `rejected` (hoàn lại số dư).

## 1.4 Dữ liệu trong database

Số liệu dưới đây lấy từ database demo đang chạy.

| Collection | Số document | Vai trò |
|---|---:|---|
| `users` | 8 | 5 user, 2 developer, 1 admin (gồm tài khoản demo và test) |
| `games` | 74 | Catalog game đã nhập và lưu trong MongoDB |
| `toys` | 12 | Merch vật lý (plush, figure, …) |
| `reviews` | 14 | Đánh giá của người dùng |
| `posts` | 1 | Bài cộng đồng |
| `orders` | 4 | 1 đơn `paid`, 3 đơn `cancelled` từ luồng thanh toán demo |
| `gamekeys` | 1 | Key demo đã cấp cho đơn `paid` |
| `payments` | 4 | 1 giao dịch `success`, 3 giao dịch `pending` |
| `qrlogins` | 0 | Token QR dùng một lần, tự hết hạn |
| `payouts` | 0 | Yêu cầu rút tiền của developer |
| `images.files` | 394 | Ảnh trong GridFS |
| `images.chunks` | 744 | Các chunk nhị phân của ảnh |

### Ví dụ document

**users — `vaultdweller`**
```json
{
  "_id": "6ac6e947b5813ede94f1c3a9",
  "username": "vaultdweller",
  "email": "gamer@vault.gg",
  "role": "user",
  "passwordHash": "<bcrypt hash>",
  "wishlist": [],
  "library": [],
  "addresses": [{ "label": "Home", "fullName": "Test User", "street": "1 Main St",
                  "city": "HCMC", "postal": "70000", "country": "US" }],
  "preferences": { "favoriteGenres": [], "matureFilter": false }
}
```

**games — `The Citadel`**
```json
{
  "_id": "6acc331b4fda3c326e2e2a4d",
  "title": "The Citadel",
  "slug": "the-citadel-mv4k02u4",
  "developer": "6ac6e947b5813ede94f1c3a8",
  "genres": ["Action", "Casual", "Indie"],
  "tags": ["FPS", "Retro", "Gore", "Old School", "Anime"],
  "price": 14.99,
  "discountPct": 0,
  "steamAppId": 1378290,
  "languages": 1,
  "languageList": [{ "name": "English", "audio": false }],
  "systemReq": {
    "specs": {
      "Windows": {
        "minimum": { "os": "Windows 10 64 bit", "cpu": "Intel Core i-5-10210U",
                     "ram": "8 GB RAM", "gpu": "NVIDIA GeForce 820M 1GB VRAM",
                     "api": "Version 12", "storage": "800 MB available space" },
        "recommended": { "os": "Windows 10 64 bit", "cpu": "Intel Core i-7-7700HQ CPU @2.80GHz",
                         "ram": "8 GB RAM", "gpu": "NVIDIA GeForce GTX 1060",
                         "api": "Version 12", "storage": "800 MB available space" }
      }
    }
  },
  "stats": { "views": 1, "reviewSum": 5, "reviewCount": 1, "keysSold": 0 },
  "status": "published"
}
```

**toys — `Hornet Plush`**
```json
{
  "_id": "6ac1ed742070ad547c6ce339",
  "title": "Hornet Plush",
  "slug": "hornet-plush-pv-toy-001",
  "brand": "Fangamer (official Hollow Knight)",
  "category": "Plush",
  "price": 32,
  "stock": 25,
  "status": "published"
}
```

**reviews**
```json
{
  "_id": "6acc37e4eb23280d3803d0ff",
  "game": "6acc331b4fda3c326e2e2a4d",
  "user": "6ac6e947b5813ede94f1c3a9",
  "stars": 5,
  "title": "Still the best in the genre",
  "body": "Played it for 200 hours and it has not lost a step…",
  "helpful": []
}
```

**images.files (GridFS)**
```json
{
  "_id": "6af47a6a21e30d1fcfe1067a",
  "filename": "https://cdn.cloudflare.steamstatic.com/steam/apps/105600/capsule_616x353.jpg",
  "contentType": "image/jpeg",
  "length": 107675,
  "uploadDate": "2026-11-11T14:23:39.729Z"
}
```

**orders**
```json
{
  "_id": "6af4ba500d61444671a83445",
  "user": "6ac6e947b5813ede94f1c3a9",
  "status": "paid",
  "subtotal": 9.99,
  "grandTotal": 10.79,
  "items": [{ "title": "Terraria", "edition": "digital", "qty": 1,
              "unitPrice": 9.99, "keyIds": ["6af4ba500d61444671a83450"] }],
  "payment": { "method": "gateway" }
}
```

**payments**
```json
{
  "_id": "6af4ba500d61444671a83447",
  "order": "6af4ba500d61444671a83445",
  "user": "6ac6e947b5813ede94f1c3a9",
  "amount": 269750,
  "currency": "VND",
  "provider": "sandbox",
  "status": "success",
  "gatewayOrderId": "PVMWCHCISS55CDC6"
}
```

**gamekeys**
```json
{
  "_id": "6af4ba500d61444671a83450",
  "game": "6acc33194fda3c326e2e2a3f",
  "user": "6ac6e947b5813ede94f1c3a9",
  "order": "6af4ba500d61444671a83445",
  "status": "sold",
  "source": "demo",
  "platform": "Steam"
}
```

Key chỉ được tạo khi một đơn `paid` được fulfilment; `codeEnc` và `codeHash` không hiển thị trong ví dụ vì là dữ liệu bảo mật.

## 1.5 Index chính

| Collection | Index | Mục đích |
|---|---|---|
| users | `username` (unique), `email` (unique) | đăng nhập / chống trùng |
| games | `slug` (unique), `title/tagline/description` (text), `price+discountPct`, `releaseDate`, `platforms`, `steamAppId` | tìm kiếm, lọc, sắp xếp |
| toys | `slug` (unique), text index, `price`, `category` | tìm kiếm merch |
| gamekeys | `codeHash` (unique), `game+status`, `user+createdAt` | chống cấp trùng key |
| orders | — | truy vấn theo `user` + `createdAt` |
| payments | `orderId` (unique), `gatewayOrderId` | chống settle hai lần |
| reviews | `game+user` (unique) | mỗi người 1 review/game |
| posts | `board` | lọc theo board |
| qrlogins | `token` (unique), TTL 90s | QR dùng một lần |
| payouts | `developer`, `status`, `requestedAt` | lọc yêu cầu theo developer / trạng thái |

## 1.6 Nguồn dữ liệu

- **Catalog**: metadata cửa hàng (tên, mô tả, thể loại, tags, giá, ngày phát hành, system requirements, ngôn ngữ, ảnh bìa) được nhập một lần và lưu trong MongoDB; runtime chỉ đọc database, không gọi dịch vụ ngoài.
- **VNPay sandbox**: callback thanh toán có chữ ký HMAC-SHA512.
- **Seed**: 3 tài khoản demo, 12 toy, 14 review, 1 bài forum.
- **Ảnh**: đã nhập vào GridFS (394 file), phục vụ qua `/api/media/:id` — không hotlink.

---

# PHẦN 2 — CÁC CHỨC NĂNG

Mỗi mục gồm **Giao diện** (route + ảnh chụp) và **Luồng xử lý** (endpoint → dữ liệu → kết quả).

## 2.1 Đăng ký / đăng nhập

**Giao diện:** `/login`, `/register` — form email/mật khẩu, nút "Sign in with Google" (nếu cấu hình), nút "Scan to log in", link demo account.

![Login](screens/08-login.png)

**Luồng xử lý:**
1. Người dùng gửi `POST /api/auth/register` hoặc `POST /api/auth/login`.
2. Server chuẩn hoá email, tìm `User` trong MongoDB.
3. Đăng ký: hash mật khẩu bằng **bcrypt** (10 rounds), tạo user với `role: 'user'`.
4. Đăng nhập: `bcrypt.compare`; sai 5 lần / 15 phút cho cùng IP+email thì bị chặn (`lib/loginLimiter.js`).
5. Thành công: ghi `req.session.user = { _id, username, role, email }`; session nằm trong cookie HttpOnly có chữ ký, không lưu MongoDB.
6. Client nhận `{ user }`, cập nhật state `me`, chuyển về trang trước.
7. Google: `POST /api/auth/google` nhận ID token, xác minh với `oauth2.googleapis.com/tokeninfo`, kiểm tra `aud`, tạo/tìm user rồi mở session.

```mermaid
sequenceDiagram
  actor U as Người dùng
  participant SPA as React SPA
  participant API as Express API
  participant DB as MongoDB

  U->>SPA: nhập email + mật khẩu
  SPA->>API: POST /api/auth/login
  API->>DB: User.findOne({ email })
  DB-->>API: user + passwordHash
  API->>API: bcrypt.compare()
  API->>API: ký cookie session
  API-->>SPA: { user }
  SPA-->>U: đăng nhập thành công
```

## 2.2 Đăng nhập bằng QR (web + Android)

**Giao diện:** nút "Scan to log in" trên trang login → hiện QR + trạng thái chờ; app Android quét mã bằng CameraX + ML Kit.

![QR login](screens/09-qr-login.png)

**Luồng xử lý:**
1. Web gọi `POST /api/qrlogin/request` → server tạo token ngẫu nhiên 24 byte, lưu `qrlogins` với `status: pending`, TTL 90 giây.
2. Web hiển thị token dưới dạng QR, poll `GET /api/qrlogin/status?token=...` mỗi 2 giây.
3. App Android (đã đăng nhập) quét QR, gọi `POST /api/qrlogin/confirm` kèm token và session cookie của app.
4. Server kiểm tra token còn hạn và đang `pending`, gán `user` của app, chuyển `status: confirmed`.
5. Web poll thấy `confirmed` → gọi `POST /api/qrlogin/activate`; server tạo session web cho đúng user đó, xoá token.
6. Token hết hạn sau 90 giây nên không thể phát lại.

## 2.3 Trang chủ

**Giao diện:** `/` — hero, ledger số liệu, featured, deals, hàng mới, toy shelf, forum strip.

![Home](screens/01-home.png)

**Luồng xử lý:**
1. Client gọi `GET /api/home`.
2. Server chạy song song: `Game.find(featured)`, `Game.find(discountPct > 0).sort(discountPct -1)`, `Game.find().sort(releaseDate -1)`, `Toy.find()`, `Post.find()`, đếm `GameKey` đã bán / `Order`.
3. Trả `{ featured, deals, fresh, toys, catTiles, threads, ledger }`; cache TTL 30 giây (`lib/cache.js`).
4. Client render hero + ledger + các shelf.

## 2.4 Cửa hàng (store)

**Giao diện:** `/games` — lưới cover 16:9, sidebar filter (giá, genre, platform, feature), sort, phân trang.

![Store](screens/02-store.png)

**Luồng xử lý:**
1. Client gọi `GET /api/games?q=&genre=&tag=&platform=&feature=&sort=&maxPrice=&onSale=&page=&limit=`.
2. Server lọc `status: published`, áp các điều kiện; nếu user bật "hide mature" thì loại rating M/AO.
3. Tìm theo từ khoá bằng regex trên title/description/tagline.
4. Sắp xếp theo popular / newest / priceAsc / priceDesc / rating.
5. Phân trang (`paginate`), trả kèm `genres`, `tags`, `categories`, `platforms` để dựng bộ lọc.
6. Client render lưới game + pager.

## 2.5 Chi tiết game

**Giao diện:** `/games/:slug` — gallery, mô tả, tag, system requirements (Minimum/Recommended), bảng ngôn ngữ, review, "More like this", rail mua.

![Game detail](screens/03-game-detail.png)
![System requirements](screens/04-game-specs.png)
![Languages](screens/05-game-languages.png)

**Luồng xử lý:**
1. `GET /api/games/:slug` — tìm game, tăng `stats.views`, lấy review, thread liên quan.
2. Client render gallery, tag, bảng specs (`systemReq.specs`) và bảng ngôn ngữ (`languageList`).
3. "More like this": `GET /api/games?genre=<genre>&limit=5`, bỏ game hiện tại.
4. Người dùng thêm vào giỏ (`POST /api/cart/add`) hoặc wishlist (`POST /api/games/:id/wishlist`).
5. Mỗi lần xem, client lưu `{slug,title,coverImage}` vào `localStorage.pv:recent` để rail hiện "Recently viewed".

## 2.6 Merch / đồ chơi

**Giao diện:** `/toys` — danh sách merch, filter category/brand, sort; `/toys/:slug` — chi tiết.

![Toys](screens/06-toys.png)

**Luồng xử lý:**
1. `GET /api/toys?q=&category=&brand=&sort=&page=` — lọc `status: published`, tìm kiếm, sắp xếp, phân trang.
2. `GET /api/toys/:slug` — chi tiết + game liên quan (`relatedAppId`).
3. Thêm vào giỏ với `kind: 'toy'`; tồn kho kiểm tra ở `POST /api/cart/add` và khi fulfilment.

## 2.7 Giỏ hàng

**Giao diện:** `/cart` — bảng item (ảnh, tên, edition, đơn giá, số lượng), nút +/- và xoá, subtotal, nút checkout.

![Cart](screens/11-cart.png)

**Luồng xử lý:**
1. Giỏ lưu trong **session** (`req.session.cart`), không phải collection riêng.
2. `GET /api/cart` — làm mới title/ảnh/giá/tồn kho từ `Game`/`Toy`; xoá item nếu sản phẩm đã biến mất.
3. `POST /api/cart/add` — kiểm tra edition (digital/physical), tồn kho physical/toy; digital không có tồn kho vì key cấp khi thanh toán.
4. `POST /api/cart/qty` — tăng/giảm số lượng có kiểm tra tồn kho.
5. `POST /api/cart/remove` — xoá theo `key`.
6. Giỏ được giữ lại nếu thanh toán thất bại để người dùng thử lại.

## 2.8 Thanh toán

**Giao diện:** `/checkout` — nếu giỏ chỉ có digital: mục "Digital delivery" + "Payment"; nếu có physical/toy: thêm chọn shipping method + form địa chỉ. Tổng tiền gồm subtotal + tax + shipping.

![Checkout](screens/12-checkout.png)

**Luồng xử lý:**
1. `GET /api/checkout/summary?method=` — tính lại subtotal, tax (`TAX_RATE`), shipping (chỉ khi có physical/toy), trả kèm địa chỉ đã lưu.
2. `POST /api/checkout/place`:
   - Kiểm tra đăng nhập, giỏ không rỗng, địa chỉ nếu có hàng vật lý.
   - Chặn mua trùng game đã sở hữu.
   - Kiểm tra tồn kho physical/toy bằng `findOneAndUpdate` có điều kiện (atomic).
   - Tạo `Order` trạng thái `pending`, snapshot giá/tên/edition.
   - Sinh `gatewayOrderId`, đổi USD → VND (`VND_PER_USD`), tạo URL VNPay có chữ ký HMAC-SHA512.
   - Tạo `Payment` trạng thái `pending`, trả `{ orderId, paymentUrl }`; client chuyển trình duyệt sang VNPay.
3. Người dùng thanh toán trên VNPay → VNPay gọi `GET /payment/return` (trình duyệt) và `GET /payment/ipn` (server-to-server).
4. `settleFromCallback`:
   - Xác minh chữ ký (`gateway.verifyCallback`), so khớp `vnp_Amount` với số tiền đã tạo.
   - `Payment.claim` chuyển `pending → success/failed` bằng một `findOneAndUpdate` — chỉ callback đầu tiên thắng, chống settle hai lần.
   - Nếu thất bại: order → `cancelled`.
   - Nếu thành công: gọi `fulfilOrder`.
5. `fulfilOrder`:
   - Claim order `pending → paid` (atomic).
   - Với từng item: toy/physical trừ kho có guard; digital gọi `issueKeys` (supplier hoặc DEMO), lưu `GameKey` (mã hoá AES-256-GCM + hash SHA-256 unique).
   - Cộng `stats`, credit 70% cho developer (`devProfile.balanceOwed`), thêm game/toy vào thư viện user, ghi `purchaseHistory`.
   - Nếu lỗi giữa chừng: revoke key đã cấp, hoàn kho, order → `failed`.
6. Chỉ khi thành công mới xoá giỏ; thất bại giữ giỏ để thử lại.

```mermaid
sequenceDiagram
  actor U as Người dùng
  participant SPA as React SPA
  participant API as Express API
  participant DB as MongoDB
  participant VNP as VNPay

  U->>SPA: bấm "Pay"
  SPA->>API: POST /api/checkout/place
  API->>DB: tạo Order (pending) + Payment (pending)
  API-->>SPA: paymentUrl
  SPA->>VNP: chuyển sang cổng thanh toán
  VNP-->>API: GET /payment/return (có chữ ký)
  API->>API: verify HMAC + amount
  API->>DB: Payment.claim(pending → success)
  API->>DB: fulfilOrder: cấp key, trừ kho, credit dev, thêm library
  API-->>SPA: { ok, orderId }
```

## 2.9 Giao key & bảo mật

**Giao diện:** key hiện trong `/library` và `/orders/:id`, có nút copy.

![Library](screens/13-library.png)

**Luồng xử lý:**
1. `lib/keyProvider.js` chọn nguồn: `KEY_SUPPLIER_URL` (POST `{game, edition, orderId}`, nhận `{key}`) hoặc DEMO placeholder.
2. Mỗi key được mã hoá **AES-256-GCM** (`iv.tag.cipher`) bằng `KEY_ENCRYPTION_SECRET`; hash **SHA-256** lưu `codeHash` unique.
3. `GameKey.issue` tạo document `status: sold`, gắn `order`, `user`, `soldAt`.
4. Chỉ chủ đơn/owner mới giải mã được key khi xem library/order.
5. Không có tồn kho key; không thể bán trùng vì `codeHash` unique.

## 2.10 Thư viện

**Giao diện:** `/library` — tab Games / Collectibles / Wishlist, playtime, achievements, key đã cấp.

![Library](screens/13-library.png)

**Luồng xử lý:**
1. `GET /api/library` — trả user (library, toyLibrary, wishlist), key theo game, key đã giải mã.
2. `POST /api/library/play/:gameId` — cộng 30 phút playtime, ghi `playHistory`.
3. Client render tab, nút copy key, tiến độ achievements.

## 2.11 Đơn hàng & giao vận

**Giao diện:** `/orders` — danh sách đơn + filter; `/orders/:id` — chi tiết item, key, shipment, nút huỷ đơn pending.

![Orders](screens/14-orders.png)

**Luồng xử lý:**
1. `GET /api/orders` — đơn của user, mới nhất trước.
2. `GET /api/orders/:id` — chi tiết + key đã giải mã (nếu là chủ đơn).
3. `POST /api/orders/:id/cancel` — chỉ huỷ được khi `status: pending`.
4. Admin: `POST /api/admin/orders/:id/advance` — packing → shipped → delivered (chỉ đơn có `shipment`).
5. Order digital không có shipment; UI hiện "Digital order — keys in library".

## 2.12 Wishlist

**Giao diện:** nút Wishlist trên game/toy detail; tab Wishlist trong `/library`; shortcut `Wishlist (n)` ở rail.

**Luồng xử lý:**
1. `POST /api/games/:id/wishlist` / `POST /api/toys/:id/wishlist` — toggle trong `User.wishlist` / `User.toyWishlist`.
2. Library trả cả hai danh sách; client hiển thị tab Wishlist.

## 2.13 Đánh giá

**Giao diện:** form review trong trang game (chọn sao, tiêu đề, nội dung); danh sách review + nút "Helpful"; Dev console có nút "Reply".

**Luồng xử lý:**
1. `POST /api/reviews/:gameId` — chỉ user đã sở hữu game mới review; unique `(game,user)`.
2. Server lưu `Review`, cập nhật `Game.stats.reviewSum/reviewCount`.
3. `POST /api/reviews/:id/helpful` — toggle user trong `helpful[]`.
4. `POST /api/reviews/:id/respond` — developer phản hồi, lưu `devResponse`.
5. Trang game hiển thị điểm trung bình + danh sách review.

## 2.14 Cộng đồng

**Giao diện:** `/community` — danh sách board/bài; `/community/p/:id` — chi tiết + reply; `/community/new` — tạo bài.

![Community](screens/07-community.png)

**Luồng xử lý:**
1. `GET /api/community?board=&game=` — danh sách bài (pinned trước).
2. `GET /api/community/p/:id` — chi tiết + replies.
3. `POST /api/community/new` — tạo bài (cần đăng nhập).
4. `POST /api/community/p/:id/reply` — thêm reply vào mảng nhúng.
5. Admin có thể xoá bài (`DELETE /api/admin/posts/:id`).

## 2.15 Dev Portal

**Giao diện:** `/dev` — KPI (gross, 70% cut, digital/physical units, owed), doanh thu theo tháng/khu vực, danh sách game, reply review; `/dev/new` publish game; `/dev/keys/:id` key vault; `/dev/toys` restock; `/dev/sales` báo cáo + CSV.

![Dev console](screens/17-dev.png)
![Dev sales](screens/18-dev-sales.png)

**Luồng xử lý:**
1. `POST /api/dev/apply` — nâng role `developer`, tạo `devProfile`.
2. `GET /api/dev` — tổng hợp từ `Order.devPayouts`, `Game.stats`, `Review`.
3. `POST /api/dev/new` — tạo game `pending`/`published` (tuỳ quyền).
4. `POST /api/dev/:id/edit` — sửa title, tagline, mô tả, cover, genres, tags, giá, discount, status và tồn kho physical.
5. `DELETE /api/dev/:id` — xoá game cùng key, review, bài forum liên quan.
6. `POST /api/dev/payout` — tạo yêu cầu rút tiền `pending` (tối thiểu $10), đưa số dư hiển thị về 0.
7. `GET /api/dev/:id/keys` + `/keys/list` — thống kê key đã cấp; `POST /:id/keys/:keyId/revoke` thu hồi.
8. `GET /api/dev/sales` — doanh thu theo tháng + CSV.
9. `POST /api/dev/toys/:id/restock` — nhập thêm tồn kho toy.

## 2.16 Admin desk

**Giao diện:** `/admin` — bảng điều khiển với KPI và các tab Users / Games / Toys / Orders / Payments / Payouts / Moderation; tìm kiếm, tạo-sửa-xoá game và toy, xem chi tiết user, đổi role, ban/unban, nhập tracking, refund, duyệt payout, xoá bài/review và xuất CSV đơn hàng.

![Admin](screens/19-admin.png)

**Luồng xử lý:**
1. `GET /api/admin` — tổng hợp đơn, user, game, toy, payment, payout, bài, review và KPI.
2. `POST /api/admin/games` / `/api/admin/games/:id` / `DELETE /api/admin/games/:id` — CRUD catalog game.
3. `POST /api/admin/toys` / `/api/admin/toys/:id` / `DELETE /api/admin/toys/:id` — CRUD merch.
4. `POST /api/admin/users/:id/role` / `/api/admin/users/:id/ban` — đổi role, ban/unban; user bị ban bị chặn ở các route cần đăng nhập.
5. `POST /api/admin/orders/:id/advance` — chuyển trạng thái shipment; `POST /api/admin/orders/:id/tracking` — lưu carrier + mã vận đơn; `POST /api/admin/orders/:id/refund` — hoàn tiền, thu hồi key và hoàn kho.
6. `POST /api/admin/payouts/:id/pay` / `/reject` — duyệt chi hoặc từ chối; từ chối hoàn lại số dư developer.
7. `DELETE /api/admin/posts/:id` / `DELETE /api/admin/reviews/:id` — xoá nội dung; xoá review cập nhật lại thống kê game.
8. `GET /api/admin/orders.csv` — xuất CSV đơn hàng.

## 2.17 Hồ sơ & cài đặt

**Giao diện:** `/users/:username` — hồ sơ công khai/thư viện preview; `/settings` — sửa displayName, bio, phone, favorite genres, mature filter, address book.

![Profile](screens/15-profile.png)
![Settings](screens/16-settings.png)

**Luồng xử lý:**
1. `GET /api/users/:username` — trả hồ sơ; nếu không phải chủ tài khoản thì ẩn email/phone/wallet/addresses.
2. `POST /api/users/me` — cập nhật các trường được phép.
3. `POST /api/users/me/addresses` / `DELETE /api/users/me/addresses/:id` — quản lý sổ địa chỉ.
4. `preferences.matureFilter` ảnh hưởng trực tiếp tới `GET /api/games`.

## 2.18 Media (GridFS)

**Giao diện:** ảnh trong mọi card/detail; URL dạng `/api/media/<fileId>`.

**Luồng xử lý:**
1. `seed/migrate-images-to-gridfs.js` nhập ảnh catalog vào bucket `images` của GridFS.
2. Document game/toy lưu URL nội bộ `/api/media/<id>` thay vì hotlink.
3. `GET /api/media/:id` mở `GridFSBucket.openDownloadStream`, set `Content-Type` + cache `immutable`.
4. Ảnh không nằm trên filesystem; backup MongoDB là đủ.

## 2.19 App Android

**Giao diện:** app Kotlin/Jetpack Compose trong `Mobile/` — bottom nav Store / Community / Library / Account; login/register, store, game detail, cart, checkout (mở VNPay), orders, library, community, recommendations, profile, QR scanner.

**Luồng xử lý:**
1. Retrofit gọi cùng `/api/*`; session cookie được lưu bằng `PersistentCookieJar`.
2. Base URL mặc định `http://10.0.2.2:3000/api/` (emulator) hoặc LAN IP (máy thật).
3. QR scanner dùng CameraX + ML Kit, gọi `/api/qrlogin/confirm`.
4. Checkout mở `paymentUrl` bằng Intent sang trình duyệt.

## 2.20 Hỗ trợ

**Giao diện:** `/support` — chính sách giao key, refund, shipping.

![Support](screens/10-support.png)

**Luồng xử lý:** trang tĩnh trong SPA, không gọi API.

---

## Phụ lục — Tài khoản demo

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Người mua | `gamer@vault.gg` | `password123` |
| Developer | `dev@neonforge.gg` | `password123` |
| Admin | `admin@pixelvault.gg` | `password123` |
