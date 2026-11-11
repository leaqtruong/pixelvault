# SỔ TAY SƠ ĐỒ — PIXELVAULT

Tài liệu tham chiếu 19 kiểu sơ đồ, khi nào dùng và cách vẽ. Các ví dụ Mermaid render trực tiếp trên GitHub; sơ đồ PlantUML cần PlantUML/mermaid.live để xuất ảnh.

## Bảng chọn nhanh

| # | Kiểu sơ đồ | Trả lời câu hỏi | Công cụ |
|---|---|---|---|
| 1 | Flowchart | Luồng xử lý / thuật toán | Mermaid |
| 2 | DFD (context + level 1) | Dữ liệu đi từ đâu đến đâu | Mermaid flowchart |
| 3 | Swimlane | Ai làm bước nào | Mermaid subgraph |
| 4 | Use case | Ai dùng được chức năng gì | PlantUML |
| 5 | Sequence | Các thành phần gọi nhau theo thứ tự nào | Mermaid |
| 6 | Class | Mô hình dữ liệu / đối tượng | Mermaid |
| 7 | ERD | Bảng, khoá, quan hệ | Mermaid |
| 8 | State | Vòng đời trạng thái | Mermaid |
| 9 | Activity | Luồng nghiệp vụ có nhánh song song | Mermaid flowchart |
| 10 | User journey | Trải nghiệm người dùng qua từng bước | Mermaid journey |
| 11 | Mind map | Phân rã ý tưởng / module | Mermaid mindmap |
| 12 | Gantt | Tiến độ theo thời gian | Mermaid gantt |
| 13 | Timeline | Mốc lịch sử / roadmap | Mermaid timeline |
| 14 | Kanban | Việc đang ở cột nào | Mermaid kanban (v11+) |
| 15 | Git graph | Nhánh và merge | Mermaid gitGraph |
| 16 | Quadrant | Ưu tiên theo 2 trục | Mermaid quadrantChart |
| 17 | Sankey | Dòng chảy / tỉ lệ chuyển đổi | Mermaid sankey-beta |
| 18 | Pie / XY chart | Tỉ lệ / xu hướng | Mermaid pie, xychart-beta |
| 19 | Block / Architecture | Kiến trúc thành phần | Mermaid block-beta / architecture-beta |
| 20 | WBS | Phân rã công việc | PlantUML |
| 21 | Heatmap / Funnel / Venn / Wireframe | Mật độ, phễu, giao thoa, giao diện | draw.io, Figma, Excel |

---

## 1. Flowchart — luồng xử lý

**Dùng khi:** mô tả thuật toán, luồng if/else, luồng đăng nhập.
**Thành phần:** start/end (oval), process (rect), decision (diamond), arrow.
**Mẹo:** 5–7 node; mỗi nhánh ghi điều kiện rõ; tránh đường cắt nhau.

```mermaid
flowchart TD
  A([Bắt đầu]) --> B{Đã đăng nhập?}
  B -- Chưa --> C[Chuyển /login]
  B -- Rồi --> D{Có hàng vật lý?}
  D -- Không --> E[Digital delivery]
  D -- Có --> F[Form địa chỉ + shipping]
  E --> G[Thanh toán]
  F --> G
```

## 2. DFD — Data Flow Diagram

**Dùng khi:** mô tả dữ liệu vào/ra hệ thống, không quan tâm thứ tự thời gian.
**Thành phần:** external entity (hình vuông), process (tròn), data store (2 gạch ngang), data flow (mũi tên có nhãn).

**Level 0 (context):**
```mermaid
flowchart LR
  U[Người dùng] -->|đăng nhập, mua hàng| S((PixelVault))
  S -->|key, thư viện| U
  S -->|yêu cầu thanh toán| V[VNPay]
  V -->|callback có chữ ký| S
  S -->|lưu| D[(MongoDB)]
  S -->|ảnh| G[(GridFS)]
```

**Level 1 (phân rã):**
```mermaid
flowchart LR
  U[Người dùng] -->|email, mật khẩu| P1((1. Đăng nhập))
  P1 --> D1[(sessions)]
  U -->|chọn game| P2((2. Giỏ hàng))
  P2 --> D2[(session.cart)]
  P2 -->|đặt hàng| P3((3. Thanh toán))
  P3 --> D3[(orders / payments)]
  V[VNPay] -->|callback| P4((4. Fulfilment))
  P4 --> D4[(gamekeys)]
  P4 --> D5[(users.library)]
```

## 3. Swimlane — sơ đồ bơi

**Dùng khi:** nhiều vai trò cùng tham gia một quy trình.
**Mẹo:** mỗi làn = một vai trò; thứ tự làn trái → phải; mũi tên nét đứt cho handoff.

```mermaid
flowchart TB
  subgraph KH["Khách hàng"]
    A[Chọn game] --> B[Thêm vào giỏ] --> C[Bấm thanh toán]
  end
  subgraph WEB["Website"]
    D[Nhận cart] --> E[Tạo order pending] --> F[Chuyển VNPay]
  end
  subgraph VNP["VNPay"]
    G[Xác nhận giao dịch] --> H[Gửi callback]
  end
  B -.-> D
  C -.-> E
  F -.-> G
  H -.-> I[Fulfilment + cấp key]
```

## 4. Use case — chức năng theo vai trò

**Dùng khi:** liệt kê chức năng tổng quan cho báo cáo.
**Thành phần:** actor (người), use case (oval), `include`/`extend`.
**Mẹo:** đừng biến use case thành flowchart; mỗi oval là một mục tiêu người dùng.

```plantuml
@startuml
left to right direction
actor Khách
actor Developer
actor Admin
rectangle PixelVault {
  Khách --> (Duyệt cửa hàng)
  Khách --> (Thêm vào giỏ)
  Khách --> (Thanh toán VNPay)
  (Thanh toán VNPay) ..> (Nhận key) : include
  Developer --> (Publish game)
  Developer --> (Xem doanh thu)
  Admin --> (Quản lý đơn)
  Admin --> (Xoá review)
}
@enduml
```

## 5. Sequence — thứ tự gọi

**Dùng khi:** mô tả một luồng qua nhiều thành phần (đăng nhập, thanh toán, QR).
**Thành phần:** actor/participant, message (→), return (-->>), `alt`/`opt`/`loop`.
**Mẹo:** chỉ giữ 4–6 participant; đặt tên theo tầng (SPA → API → DB → Gateway).

```mermaid
sequenceDiagram
  actor U as Người dùng
  participant SPA as React SPA
  participant API as Express API
  participant DB as MongoDB
  participant VNP as VNPay

  U->>SPA: bấm Pay
  SPA->>API: POST /api/checkout/place
  API->>DB: Order pending + Payment pending
  API-->>SPA: paymentUrl
  SPA->>VNP: chuyển cổng thanh toán
  VNP-->>API: GET /payment/return (chữ ký)
  alt chữ ký hợp lệ
    API->>DB: Payment.claim + fulfilOrder
    API-->>SPA: { ok: true, orderId }
  else sai chữ ký
    API-->>SPA: { ok: false, reason: invalid-signature }
  end
```

## 6. Class — mô hình dữ liệu

**Dùng khi:** trình bày schema/đối tượng và quan hệ.
**Mẹo:** chỉ ghi field quan trọng; ghi cardinality; tách enum ra ghi chú.

```mermaid
classDiagram
  class User {
    ObjectId _id
    string username
    string email
    string role
    List~ObjectId~ wishlist
    List~LibraryEntry~ library
  }
  class Game {
    ObjectId _id
    string title
    string slug
    number price
    number discountPct
    string status
  }
  class Order {
    ObjectId _id
    List~OrderItem~ items
    number grandTotal
    string status
  }
  class GameKey {
    ObjectId _id
    string codeEnc
    string codeHash
    string status
  }
  User "1" --> "*" Game : developer
  User "1" --> "*" Order : buyer
  Order "1" --> "*" GameKey : delivers
  Game "1" --> "*" GameKey : issued for
```

## 7. ERD — quan hệ bảng

**Dùng khi:** cần nhấn mạnh khoá và quan hệ 1–N / N–N (gần với MongoDB hơn class diagram).
**Mẹo:** ghi rõ PK/FK; không cần method.

```mermaid
erDiagram
  USERS ||--o{ ORDERS : places
  USERS ||--o{ REVIEWS : writes
  USERS ||--o{ POSTS : authors
  GAMES ||--o{ REVIEWS : receives
  GAMES ||--o{ GAMEKEYS : issued
  ORDERS ||--o{ GAMEKEYS : delivers
  ORDERS ||--o{ PAYMENTS : paid_by
  GAMES ||--o{ POSTS : discusses
  USERS {
    ObjectId _id PK
    string username
    string email
    string role
  }
  GAMES {
    ObjectId _id PK
    string title
    number price
    string status
  }
  ORDERS {
    ObjectId _id PK
    ObjectId user FK
    number grandTotal
    string status
  }
  GAMEKEYS {
    ObjectId _id PK
    ObjectId game FK
    ObjectId order FK
    string codeHash
  }
  PAYMENTS {
    ObjectId _id PK
    ObjectId order FK
    string status
  }
```

## 8. State — vòng đời trạng thái

**Dùng khi:** một thực thể có nhiều trạng thái và chuyển trạng thái có điều kiện (order, payment, shipment).
**Mẹo:** mỗi mũi tên ghi sự kiện; đánh dấu trạng thái cuối.

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> paid : thanh toán thành công
  pending --> cancelled : huỷ / gateway thất bại
  paid --> fulfilled : cấp key + trừ kho
  fulfilled --> shipped : có hàng vật lý
  shipped --> delivered
  paid --> failed : lỗi fulfilment
  failed --> [*]
  delivered --> [*]
```

## 9. Activity — luồng nghiệp vụ

**Dùng khi:** quy trình có nhánh song song / nhiều bước nghiệp vụ (gần flowchart nhưng có fork/join).
**Mẹo:** dùng `fork/join` cho bước song song; ghi rõ điều kiện ở decision.

```mermaid
flowchart TD
  A([Bắt đầu]) --> B[Kiểm tra giỏ]
  B --> C{Giỏ rỗng?}
  C -- Có --> D[Thông báo]
  C -- Không --> E[Hợp lệ hoá địa chỉ nếu cần]
  E --> F[Tạo order pending]
  F --> G[Gọi VNPay]
  G --> H{Kết quả?}
  H -- Thành công --> I[Cấp key + trừ kho + credit dev]
  H -- Thất bại --> J[Giữ giỏ, order cancelled]
  I --> K([Kết thúc])
  J --> K
  D --> K
```

## 10. User journey — trải nghiệm người dùng

**Dùng khi:** trình bày UX, điểm đau, mức hài lòng từng bước.
**Thang điểm:** 1 (tệ) → 5 (tốt).

```mermaid
journey
  title Hành trình mua game trên PixelVault
  section Khám phá
    Mở cửa hàng: 5: Khách
    Lọc thể loại: 4: Khách
    Xem chi tiết game: 5: Khách
  section Mua
    Thêm vào giỏ: 5: Khách
    Thanh toán VNPay: 3: Khách, VNPay
    Nhận key: 5: Khách
  section Sau mua
    Chơi game: 5: Khách
```

## 11. Mind map — phân rã ý tưởng

**Dùng khi:** brainstorm, chia module, mục lục báo cáo.
**Mẹo:** tối đa 3 tầng; mỗi nhánh 3–5 node.

```mermaid
mindmap
  root((PixelVault))
    Store
      Games
      Toys
      Filters
    Account
      Library
      Orders
      Wishlist
    Payments
      VNPay
      Key delivery
    Admin
      Orders
      Posts
      Reviews
```

## 12. Gantt — tiến độ

**Dùng khi:** kế hoạch đồ án, sprint, roadmap.
**Mẹo:** chia section theo giai đoạn; dùng `after` để nối task.

```mermaid
gantt
  title Kế hoạch đồ án PixelVault
  dateFormat YYYY-MM-DD
  section Phân tích
    Khảo sát Steam API: a1, 2026-09-01, 7d
    Thiết kế MongoDB: a2, after a1, 5d
  section Phát triển
    Backend Express: b1, after a2, 14d
    React SPA: b2, after a2, 14d
    Android Kotlin: b3, after b1, 10d
  section Kiểm thử
    Unit test: c1, after b2, 5d
    QA giao diện: c2, after c1, 4d
```

## 13. Timeline — mốc lịch sử

**Dùng khi:** lịch sử phát triển, các cột mốc.
**Mẹo:** mỗi mốc 1 dòng; không quá 8 mốc.

```mermaid
timeline
  title Các cột mốc PixelVault
  2026-09 : Khởi tạo catalog 74 game
           : Import metadata từ Steam
  2026-10 : Tích hợp VNPay sandbox
           : Key delivery + AES-256-GCM
  2026-11 : Android app + QR login
           : GridFS + system specs + languages
```

## 14. Kanban — trạng thái công việc

**Dùng khi:** quản lý việc nhóm, demo quy trình.
**Lưu ý:** Mermaid kanban cần v11+; nếu GitHub chưa render, dùng flowchart 3 cột.

```mermaid
kanban
  todo[To do]
    t1[Thiết kế ERD]
    t2[Viết báo cáo]
  doing[Doing]
    t3[Kiểm thử thanh toán]
  done[Done]
    t4[Catalog 74 game]
```

## 15. Git graph — nhánh và merge

**Dùng khi:** minh hoạ quy trình git, feature branch.
**Mẹo:** chỉ vẽ nhánh chính + 2–3 nhánh feature.

```mermaid
gitGraph
  commit id: "init"
  branch feature/vnpay
  commit id: "payment"
  checkout main
  merge feature/vnpay
  branch feature/android
  commit id: "mobile"
  checkout main
  merge feature/android
```

## 16. Quadrant — ưu tiên 2 trục

**Dùng khi:** chọn tính năng theo giá trị / công sức, rủi ro / tác động.
**Mẹo:** đặt tên 4 góc theo hành động (Làm ngay, Lên kế hoạch, Bỏ qua, Làm sau).

```mermaid
quadrantChart
  title Ưu tiên tính năng
  x-axis "Dễ làm" --> "Khó làm"
  y-axis "Giá trị thấp" --> "Giá trị cao"
  quadrant-1 "Làm ngay"
  quadrant-2 "Lên kế hoạch"
  quadrant-3 "Bỏ qua"
  quadrant-4 "Làm sau"
  "Thanh toán VNPay": [0.75, 0.90]
  "QR login": [0.60, 0.70]
  "GridFS": [0.40, 0.55]
  "Mods": [0.30, 0.20]
```

## 17. Sankey — dòng chảy / phễu

**Dùng khi:** tỉ lệ chuyển đổi, phân bổ nguồn lực, dòng người dùng.
**Mẹo:** tổng hai đầu phải khớp; nhãn ngắn.

```mermaid
sankey-beta
"Người dùng","Giỏ hàng",100
"Giỏ hàng","Thanh toán",60
"Giỏ hàng","Bỏ đi",40
"Thanh toán","Đơn thành công",45
"Thanh toán","Thất bại",15
```

## 18. Pie / XY chart — tỉ lệ và xu hướng

**Pie:** tỉ lệ một thời điểm (tối đa 5–6 lát).
**XY:** xu hướng theo thời gian; kết hợp bar + line.

```mermaid
pie title Doanh thu theo thể loại
  "Action" : 45
  "Indie" : 25
  "RPG" : 20
  "Khác" : 10
```

```mermaid
xychart-beta
  title "Đơn hàng theo tháng"
  x-axis [T9, T10, T11, T12]
  y-axis "Đơn" 0 --> 40
  bar [4, 12, 25, 33]
  line [4, 12, 25, 33]
```

## 19. Block / Architecture — kiến trúc thành phần

**Block:** các khối lớn, ít chi tiết.
**Architecture-beta:** cần Mermaid v11+; nếu không render, dùng flowchart.

```mermaid
block-beta
  columns 3
  spa["React SPA"] api["Express API"] db[("MongoDB")]
  grid["GridFS"] vnpay["VNPay"] key["Key supplier"]
```

```mermaid
flowchart LR
  SPA[React SPA] --> API[Express API]
  MOB[Android App] --> API
  API --> DB[(MongoDB)]
  API --> GF[(GridFS)]
  API --> VNP[VNPay]
  API --> SUP[Key supplier]
```

## 20. WBS — phân rã công việc

**Dùng khi:** chia việc theo cây (báo cáo, đồ án).
**Công cụ:** PlantUML.

```plantuml
@startwbs
* PixelVault
** Phân tích
*** Khảo sát Steam API
*** Thiết kế MongoDB
** Phát triển
*** Backend Express
*** React SPA
*** Android Kotlin
** Kiểm thử
*** Unit test
*** QA giao diện
@enduml
```

## 21. Heatmap / Funnel / Venn / Wireframe

Không có native Mermaid; dùng công cụ khác:

| Kiểu | Dùng khi | Cách vẽ nhanh |
|---|---|---|
| Heatmap | Mật độ lỗi, hoạt động theo giờ | Bảng Excel/Google Sheets + conditional formatting |
| Funnel | Tỉ lệ rơi rụng qua từng bước | draw.io / Figma; hoặc Sankey |
| Venn | Giao thoa 2–3 tập | draw.io / Figma |
| Wireframe | Phác giao diện trước khi code | Figma / Excalidraw / draw.io |

---

## Mẹo chung khi đưa sơ đồ vào slide

1. **Một sơ đồ = một ý.** Đừng nhồi cả hệ thống vào một hình.
2. **5–7 node** là giới hạn đọc tốt trên slide; chi tiết để sơ đồ phụ.
3. **Một accent color** cho điểm nhấn; còn lại dùng đen/trắng/xám.
4. **Label ngắn**, động từ + danh từ: "Tạo order", "Cấp key", "Gửi callback".
5. **Sequence:** actor bên trái, thời gian chảy xuống; đánh số bước nếu thuyết trình.
6. **Class/ERD:** chỉ giữ field quan trọng; ghi cardinality; tách bảng lớn thành 2 sơ đồ.
7. **Xuất ảnh cho PowerPoint:** mermaid.live → Export PNG/SVG; hoặc `npx @mermaid-js/mermaid-cli -i file.mmd -o out.png -w 1920`.
8. **Kiểm tra render** trên GitHub trước khi chụp vào slide.

Sources:
- [Mermaid — All Diagram Examples](https://mermaid.ai/open-source/syntax/all-examples.html)
- [Mermaid Studio — Diagram Types](https://mermaidstudio.dev/docs/diagram-types/overview/)
- [Mermaid Cheatsheet — All 19 Diagram Types](https://mermandraw.com/cheatsheet/)
- [UML Diagram Types — Creately](https://creately.com/blog/diagrams/uml-diagram-types-examples/)
- [DFD Levels 0, 1, 2 — Flowova](https://flowova.ai/blog/data-flow-diagram-guide)
- [PlantUML Diagram Types](https://deepwiki.com/plantuml/plantuml/4-diagram-types)
