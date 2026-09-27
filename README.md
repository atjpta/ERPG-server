# ERPG Server

Server cho MMORPG pixel top-down **ERPG** (client Unity — Android/Google Play + PC).

- Colyseus 0.18 (REST API + realtime room), uWebSockets transport
- PostgreSQL + Drizzle ORM, Zod 4, TypeScript 6, Node ≥ 24

## Chạy local

```bash
yarn install
cp .env.example .env.development   # sửa POSTGRES_URI, JWT_SECRET, ADMIN_JWT_SECRET, GOOGLE_WEB_CLIENT_ID
yarn db:migrate
yarn seed
yarn dev                           # http://localhost:2567 — playground ở "/", monitor ở "/monitor"
yarn smoke                         # test end-to-end (server phải đang chạy)
```

## Luồng client (Unity)

1. `GET /master-data/client-version?platform=android&version=x.y.z` → `forceUpdate` thì mở `downloadUrl`.
2. Đăng nhập:
    - **Android** — Credential Manager / Sign in with Google lấy `idToken` (nonce từ `POST /auth/oauth/nonce`)
      → `POST /auth/oauth/google/login` `{ idToken, nonce, platform: "android", clientVersion, device }`.
    - **PC** — Google OAuth desktop flow lấy `idToken` → cùng endpoint
      `POST /auth/oauth/google/login` `{ idToken, nonce, platform: "pc", clientVersion, device }`.
3. Response có `token` (user) + `playerToken` + `player` (map, toạ độ...).
4. Join realtime: Colyseus Unity SDK, `client.Auth.Token = playerToken`,
   `JoinOrCreate<WorldState>("world", { mapCode = player.mapCode })`.
5. Di chuyển theo [Colyseus Netcode](https://docs.colyseus.io/netcode) (tick 20Hz):
    - Mỗi fixed step: `input = room.Input(...)`, gán `MoveX`/`MoveY` ∈ {-1, 0, 1} rồi `Send()` (1 input / step).
    - Player của mình: `predict.reconciler` với step = bản C# của
      [`movement.step.ts`](src/rooms/world/simulation/movement.step.ts) (port y hệt, cùng hằng số).
    - Player khác: nội suy (lerp) từ state `players` (key = sessionId).
6. Bị đá khỏi room → `OnLeave(code)`: `4001` đăng nhập ở máy khác, `4002` bị ban, `4003` tài khoản đã
   xoá, `4004` phiên đăng nhập hết hiệu lực (logout) → hiện thông báo và quay về màn đăng nhập,
   **không** tự reconnect với các code này.

## Google Sign-In — cấu hình bắt buộc

- Google Cloud: tạo OAuth client loại **Web application** làm audience của ID token; cấu hình cùng Client ID trong
  Unity `googleServerClientId` và server `GOOGLE_WEB_CLIENT_ID`. Luồng ID token không cần Game server credential
  hay client secret. Endpoint Play Games `auth/oauth/play-games/login` cũ vẫn cần client secret nếu còn dùng.
- Play Console → App content → Data safety → **Delete account URL**: `<PUBLIC_URL>/account-deletion`.
- Trong game phải có nút xoá tài khoản → `DELETE /auth/account` (xoá ngay, token hết hiệu lực).

Tài liệu cho dev: [CLAUDE.md](CLAUDE.md), [docs/module-pattern.md](docs/module-pattern.md),
[src/core/README.md](src/core/README.md).
