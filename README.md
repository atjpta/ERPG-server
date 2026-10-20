# ERPG Server

Server cho MMORPG pixel top-down **ERPG** (client Unity — Android/Google Play + PC).

- Colyseus 0.18 (REST API + realtime room), uWebSockets transport
- PostgreSQL + Drizzle ORM, Zod 4, TypeScript 6, Node ≥ 24

## Chạy local

```bash
yarn install
cp .env.example .env.development   # sửa POSTGRES_URI, JWT_SECRET, ADMIN_JWT_SECRET, GOOGLE_WEB_CLIENT_ID
yarn db:drop                       # (tuỳ chọn) XOÁ database cũ để làm lại từ đầu; chỉ chạy với DB local
yarn db:create                     # tạo database trong POSTGRES_URI nếu chưa có (cần PostgreSQL đang chạy)
yarn db:migrate
yarn seed
yarn dev                           # http://localhost:2567 — playground ở "/", monitor ở "/monitor"
yarn smoke                         # test end-to-end (server phải đang chạy)
```

Từ Unity: Hub → Config → Server → **First-time setup** kiểm tra Node ≥ 24, Yarn, `node_modules`, `.env.keys` và có nút
**Run all** (install → drop DB → create DB → migrate → seed, xoá sạch DB cũ).

## Token cho user test local (mỗi class một user)

Khi server đang chạy và DB đã migrate/seed, chạy `yarn test:tokens`.
Script tự tạo hoặc đăng nhập `test-swordsman@erpg.local`, `test-archer@erpg.local` và `test-cleric@erpg.local`
(mỗi tài khoản một nhân vật đúng class), mật khẩu mặc định `123456`.
Có thể đổi địa chỉ server bằng `SERVER_URL` và mật khẩu bằng `TEST_USER_PASSWORD`.

Token được in ra terminal và lưu tại `generated/local-test-tokens.json` (đã được Git bỏ qua).
Dùng `playerToken` để join room `world` với `mapCode` trong thông tin player, hoặc gọi `/user/players/me`;
dùng `token` cho các API `/user/auth`. Chạy lại script để lấy token mới; nếu bật chế độ một session/user,
phiên cũ của hai tài khoản test sẽ bị thu hồi.

Sau khi lấy token, `yarn test:tokens` gọi tiếp `yarn test:loadout` (chạy riêng được) để cấp sẵn đồ test cho ba nhân vật:
level, điểm attribute/kỹ năng chưa cộng, gold/gem, mỗi loại consumable/material và trang bị của từng biome.
Script chỉ **bổ sung phần còn thiếu** (không hạ level, không nhân đôi đồ) nên chạy lại bao nhiêu lần cũng an toàn;
nên chạy khi nhân vật đang offline. Muốn đổi mức cấp (level, gold, số lượng, độ hiếm trang bị) thì sửa các hằng số
ở đầu `scripts/local-test-loadout.ts`.

## Luồng client (Unity)

1. `GET /master-data/client-version?platform=android&version=x.y.z` → `forceUpdate` thì mở `downloadUrl`.
2. Đăng nhập:
    - **Android** — Credential Manager / Sign in with Google lấy `idToken` (nonce từ `POST /user/auth/oauth/nonce`)
      → `POST /user/auth/oauth/google/login` `{ idToken, nonce, platform: "android", clientVersion, device }`.
    - **PC** — Google OAuth desktop flow lấy `idToken` → cùng endpoint
      `POST /user/auth/oauth/google/login` `{ idToken, nonce, platform: "pc", clientVersion, device }`.
3. Response có `token` (user) + `playerToken` + `player` (map, toạ độ...).
4. Join realtime: Colyseus Unity SDK, `client.Auth.Token = playerToken`,
   `JoinOrCreate<WorldState>("world", { mapCode = player.mapCode })`.
5. Di chuyển theo [Colyseus Netcode](https://docs.colyseus.io/netcode) (tick 40Hz):
    - Mỗi fixed step: `input = room.Input(...)`, gán `MoveX`/`MoveY` ∈ {-1, 0, 1} rồi `Send()` (1 input / step).
    - Player của mình: `predict.reconciler` với step = bản C# của
      [`movement.step.ts`](src/rooms/world/modules/players/simulation/movement.step.ts) (port y hệt, cùng hằng số).
    - Player khác: nội suy (lerp) từ state `players` (key = sessionId).
6. Bị đá khỏi room → `OnLeave(code)`: `4001` đăng nhập ở máy khác, `4002` bị ban, `4003` tài khoản đã
   xoá, `4004` phiên đăng nhập hết hiệu lực (logout) → hiện thông báo và quay về màn đăng nhập,
   **không** tự reconnect với các code này.

## Google Sign-In — cấu hình bắt buộc

- Google Cloud: tạo OAuth client loại **Web application** làm audience của ID token; cấu hình cùng Client ID trong
  Unity `googleServerClientId` và server `GOOGLE_WEB_CLIENT_ID`. Luồng ID token không cần Game server credential
  hay client secret. Endpoint Play Games `auth/oauth/play-games/login` cũ vẫn cần client secret nếu còn dùng.
- Play Console → App content → Data safety → **Delete account URL**: `<PUBLIC_URL>/user/account-deletion`.
- Trong game phải có nút xoá tài khoản → `DELETE /user/auth/account` (xoá ngay, token hết hiệu lực).

Tài liệu cho dev: [CLAUDE.md](CLAUDE.md), [docs/module-pattern.md](docs/module-pattern.md),
[src/core/README.md](src/core/README.md).
