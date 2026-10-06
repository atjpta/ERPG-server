# Init checklist — server game (Colyseus + Postgres/Drizzle)

Ghi lại những gì đã làm khi init ERPG-server (2026-09-27, lấy `server-slime` làm mẫu) để lần sau
init project mới thì làm theo đúng thứ tự này.

## 1. Chốt version thư viện trước khi viết code

- Check version mới nhất: `npm view <pkg> version` cho từng package, **và check peer deps**:
  `npm view typescript-eslint peerDependencies`, `npm view colyseus peerDependencies`...
- Bài học lúc init:
    - **TypeScript giữ `~6.0.x`** — TS 7 (native) chưa được `typescript-eslint` hỗ trợ (`<6.1.0`).
    - **uWebSockets.js** không có trên npm, pin qua `resolutions` bằng tarball tag GitHub.
      Bản `v20.71.0` bị lỗi ESM wrapper (`import './index.js'` không tồn tại) → dùng `v20.70.0`.
      Lần sau check nhanh: `curl -sL https://raw.githubusercontent.com/uNetworking/uWebSockets.js/<tag>/ESM_wrapper.mjs`
      phải import `./uws.js`, và tag phải có file `uws_win32_x64_<ABI node>.node`.
    - Colyseus 0.18 + `@colyseus/schema` 5: dùng builder `schema({...}, "Name")` + `t.*`,
      **không cần** `experimentalDecorators` / `useDefineForClassFields` nữa.
    - `@colyseus/better-call` phải khai báo trực tiếp trong `dependencies` (dùng `APIError`).
    - **Không đặt field `sessionId` trong dữ liệu `onAuth` trả về** (payload JWT): Colyseus 0.18 dùng
      `authData?.sessionId || generateId()` làm `client.sessionId` → mọi kết nối cùng token trùng
      sessionId. Claim trỏ tới `user_sessions.id` đặt tên `userSessionId`.
- Luôn dùng **yarn** (không `npm run`). Cài lần đầu: `yarn install`.

## 2. File cấu hình gốc

| File                                                    | Ghi chú                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `package.json`                                          | `"type": "module"`, scripts dev/build/seed/db:_/env:_/smoke, `lint-staged`, `resolutions` |
| `tsconfig.json` / `tsconfig.build.json`                 | `NodeNext`, alias `@/* → src/*`, build xong chạy `tsc-alias`                              |
| `drizzle.config.ts`                                     | schema = `src/modules/**/entities/*.entity.ts`, out = `src/migrations`                    |
| `eslint.config.js`, `.prettierrc`                       | tab 4, printWidth 100, double quote                                                       |
| `.husky/` + `commitlint.config.js`                      | pre-commit `lint-staged`, commit-msg Conventional Commits                                 |
| `.env.example` → `.env.development` / `.env.production` | mã hoá bằng dotenvx (`yarn env:dev:encrypt`, `yarn env:prod:encrypt`) rồi mới commit      |
| `Dockerfile`                                            | build → migrate → seed → start (cần `DOTENV_PRIVATE_KEY_PRODUCTION` lúc `docker run`)     |
| `test/`                                                 | mocha + tsx, `test/setup.ts` đặt env giả — unit test chạy không cần DB (`yarn test`)      |

> `@colyseus/tools` tự nạp `.env.development` khi chạy → biến nào không dùng (vd `REDIS_URI`) thì
> **comment lại**, nếu không server sẽ cố kết nối Redis và spam lỗi.

> **dotenvx 2.x trên Windows không tạo file `.env.keys`** — private key lưu trong **Windows Credential
> Manager** (tên `dotenvx:<public key>`). Máy khác/CI/Docker cần key: lấy bằng
> `npx dotenvx keypair DOTENV_PRIVATE_KEY_PRODUCTION -f .env.production` rồi truyền qua env
> `DOTENV_PRIVATE_KEY_PRODUCTION`. Mất key = mất secret → lưu key vào password manager của team.
> Đổi key: `yarn env:dev:decrypt`, xoá dòng `DOTENV_PUBLIC_KEY_*`, `yarn env:dev:encrypt`,
> rồi `cmdkey /delete:dotenvx:<public key cũ>`.

## 3. `src/configs/`

- `env.config.ts` — đọc env, biến bắt buộc dùng `required()`. Secret admin tách riêng (`ADMIN_JWT_SECRET`).
- `postgres.config.ts` — `db` (drizzle + postgres-js), type `Queryable` (db hoặc tx).
- `redis.config.ts` — có `REDIS_URI` thì bật `RedisDriver` + `RedisPresence` (scale nhiều process) **và**
  chuyển `cacheService` sang Redis (`connectRedisCache()`) để nonce/rate limit dùng chung giữa các process.
- `cors.config.ts` — `applyCorsPolicy()` override `matchMaker.controller.getCorsHeaders` theo `CORS_ORIGINS`
  (Colyseus mặc định `*`). Áp dụng cho cả REST lẫn matchmaking, cả uWS transport.
- `time.config.ts` — timezone mặc định `Asia/Ho_Chi_Minh`.

## 4. `src/core/` — hạ tầng dùng chung

| Thành phần                             | Vai trò                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entities/base.entity.ts`              | `baseColumns()` (id UUID v7, createdAt, updatedAt), `baseWithCodeColumns()`                                                                       |
| `repositories/base.repository.ts`      | CRUD chung, **mọi method nhận 1 object param** (`{ id, data, dbOrTx }`), `withTransaction()`                                                      |
| `services/base.service.ts`             | Mirror 1-1 các hàm của `BaseRepository` (cùng tên, cùng param) — service kế thừa để có sẵn CRUD                                                   |
| `utils/load-controllers.util.ts`       | Quét `*.controller.ts` trong `modules/` + `rooms/`, gom export tên kết thúc `Controller` (báo lỗi nếu trùng key endpoint)                         |
| `utils/response.util.ts`               | `Response.ok/created/badRequest/...` + `RouterContainer` (bắt ZodError → 422, `serviceError` → đúng status)                                       |
| `utils/service-error.ts`               | `serviceError(message, status, ResponseCode)` — throw trong service                                                                               |
| `utils/rate-limit.util.ts`             | `assertRateLimit(rule, identity)` — fixed window qua `cacheService.incr`, vượt → 429. `getClientIp()` chỉ tin header proxy khi `TRUST_PROXY=true` |
| `utils/big-number.util.ts`             | `Big`/`big()` (bignumber.js, 20 chữ số thập phân), `clampBig`, `floorBig` — mọi phép tính stat/damage, tránh sai số float                         |
| `middlewares/rate-limit.middleware.ts` | `createRateLimitMiddleware(rule)` — giới hạn theo IP, gắn vào `use: [...]` của endpoint                                                           |
| `enums/response-code.enum.ts`          | Mã lỗi trả về client (client map sang text đa ngôn ngữ)                                                                                           |
| `enums/client-platform.enum.ts`        | `android` (Google Play), `pc`                                                                                                                     |
| `cache/`                               | `cacheService` (Memory mặc định, đổi sang `RedisCacheStore` khi chạy nhiều process)                                                               |
| `validators/`                          | `IdParamSchema` (uuidv7), `PaginationSchema`, `LocalizedStringSchema`                                                                             |

**Không** làm generic CRUD controller factory — controller luôn viết tường minh từng endpoint.

## 5. Module pattern (`src/modules/<module>/`)

```
<module>/
├── entities/  enums/  repositories/  constants/  types/  middlewares/  seeds/   # dùng chung
├── user/
│   ├── controllers/<name>.controller.ts        # export `<name>Controller`
│   ├── services/<name>.service.ts
│   └── validators/<name>.validator.ts
└── admin/
    ├── controllers/admin.<name>.controller.ts  # export `admin<Name>Controller`, prefix `/admin/...`
    ├── services/admin.<name>.service.ts
    └── validators/admin.<name>.validator.ts
```

Chi tiết + code mẫu: [docs/module-pattern.md](../../docs/module-pattern.md).

## 6. Module khởi tạo sẵn

- `auth/` — **user + admin + player + game-server**:
    - User: đăng ký/đăng nhập email, session theo thiết bị (platform + clientVersion), logout 1/tất cả thiết bị.
    - Đăng nhập Google — **không có "Play Games v3"** (09/2026 bản mới nhất là Play Games Services **v2 SDK**,
      plugin Unity `play-games-plugin-for-unity` v2.2.x; Google Sign-In cũ đã deprecated):
        - Android: `POST /auth/oauth/play-games/login` `{ serverAuthCode }` — server đổi code (Web Client ID +
          Secret, `redirect_uri` rỗng) rồi gọi `games/v1/players/me`. Client xin thêm scope `OPEN_ID` →
          có idToken → liên kết luôn danh tính Google (`sub`) để PC đăng nhập ra cùng tài khoản.
        - PC: `POST /auth/oauth/google/login` `{ idToken, nonce? }`.
        - 1 user nhiều danh tính (`user_oauth_accounts`): `findOrCreateOauthUser()` tìm theo bất kỳ danh tính
          nào, gắn thêm danh tính còn thiếu.
    - **Xoá tài khoản (bắt buộc theo Google Play)**: trong app `DELETE /auth/account` (xoá ngay), web
      `GET /account-deletion` (trang HTML khai báo trên Play Console) → admin xử lý ở
      `/admin/account-deletion-requests`. Xoá = xoá dữ liệu game + liên kết + session, ẩn danh `users`
      (`AccountDeletionService.purgeUserData` — **thêm bảng dữ liệu người chơi mới thì phải xoá ở đây**).
    - Rate limit: đăng ký/đăng nhập theo IP + số lần thử mật khẩu theo email (`constants/rate-limit.constant.ts`).
    - Player: user 1:N player về schema, **hiện tại 1:1** — login tự tạo player ở server mặc định
      (`DEFAULT_GAME_SERVER_CODE`) và trả luôn `playerToken`.
    - 3 loại token: user (`authMiddleware`), player (`authPlayerMiddleware`, join room), admin (`adminAuthMiddleware`, secret riêng).
- `master-data/` — config key-value, `value` validate bằng zod theo từng key (`MasterDataValueSchemas`);
  check phiên bản client (`GET /master-data/client-version`, login bị chặn 426 nếu dưới `minVersion`).
- `maps/` — metadata map (toạ độ đơn vị tile), spawn point, số người/kênh.

## 7. Realtime (`src/rooms/`)

- `BasePlayerRoom` — `onAuth` verify player token + quản lý kết nối online qua **presence pub/sub**
  (memory 1 process, `RedisPresence` nhiều process — không đổi code):
    - Room con gọi `registerOnlinePlayer` (cuối `onJoin`), `unregisterOnlinePlayer` (`onLeave`),
      `verifyReconnect` (`onReconnect` — reconnect không đi qua `onAuth` nên phải kiểm tra lại DB).
    - Mỗi room subscribe topic `auth:kick:user:<userId>` cho user đang online; `playerKickService`
      publish sau khi DB commit → room đá client với close code: 4001 đăng nhập trùng, 4002 bị ban,
      4003 xoá tài khoản, 4004 session bị thu hồi (logout/force logout/single session).
    - Đăng nhập trùng: join xong tự publish `DUPLICATE_LOGIN` (trừ chính kết nối mới) → đá kết nối cũ
      ở mọi room/process.
    - Thêm chỗ thu hồi quyền chơi mới (ban, khoá...) → gọi `playerKickService` sau khi ghi DB.
- `world` room — 1 room = 1 kênh của 1 map (`filterBy(["mapCode"])`), reconnect 20s khi rớt mạng,
  checkpoint state mỗi 30 giây và lưu lần cuối khi rời. Save dùng optimistic check qua `player_states.revision`
  để checkpoint cũ không ghi đè admin edit hoặc state mới hơn.
- `auth.players` giữ identity, server, tên, trạng thái ban và lần chơi cuối; module `player` sở hữu
  `player_states` (level/exp, HP/MP, map, tọa độ, hướng). Tạo hai bản ghi trong cùng transaction,
  ghép lại trong `PlayerService` để giữ response hiện có; migration backfill dữ liệu cũ.
- Các thao tác lifecycle trong world được dispatch qua `@colyseus/command`: `JoinPlayerWorldCommand`
  nạp player và `LeavePlayerWorldCommand` lưu, dọn player. Input di chuyển được xử lý trực tiếp
  trong fixed tick bởi `PlayerWorldService`.
  Gọi `dispatcher.stop()` khi room dispose.
- Admin edit player publish `PLAYER_UPDATED` sau commit để room đóng kết nối hiện tại; player reconnect
  sẽ nạp lại hồ sơ/state mới.
- Di chuyển dùng **Colyseus Netcode** (https://docs.colyseus.io/netcode), không dùng `messages`/`onMessage`:
    - Input schema phẳng (`schema/move.world.input.ts`) khai báo bằng `inputs = this.defineInput(MoveInput, { sanitize })`.
    - `this.setFixedTimestep((ctx) => this.step(ctx), TICK_RATE)` — **không** dùng `setSimulationInterval`
      (đã deprecated, dt thay đổi nên client không predict được).
    - Shared world: mỗi step mỗi player lấy đúng 1 input (`this.inputs.get(sessionId).next()`) — framework
      tự gửi ack về client để reconcile. Không dùng `drain()` (đi nhanh gấp N lần khi client spam input).
    - Logic step tách thành hàm thuần (`simulation/*.step.ts`) — client port y hệt để `predict.reconciler` khớp.
    - Room generic khai báo `input`: `Room<{ state; client; input: MoveInput }>`.

## 8. Chạy lần đầu

```bash
yarn install
cp .env.example .env.development   # sửa POSTGRES_URI, JWT_SECRET, GOOGLE_WEB_CLIENT_ID/SECRET
yarn env:dev:encrypt               # mã hoá trước khi commit
yarn db:generate --name init       # chỉ khi chưa có src/migrations
yarn db:migrate
yarn seed
yarn dev
yarn test                          # unit test (không cần DB)
yarn smoke                         # (terminal khác) test end-to-end register → join room → move
yarn kick-test                     # (terminal khác) test đá player: login trùng, ban, logout, xoá TK
```

Admin mặc định (seed): `admin@gmail.com` / `123456` — **đổi ngay ở môi trường thật**.
