# CLAUDE.md

Server cho **ERPG** — MMORPG pixel top-down. Client làm bằng **Unity**, build ra Android (Google Play)
và PC. Server: Colyseus 0.18 (REST + realtime room) · PostgreSQL/Drizzle · Zod · TypeScript.

## Cấu trúc

```
src/
├── configs/     # env, postgres, redis (tuỳ chọn), timezone
├── core/        # hạ tầng dùng chung — xem src/core/README.md (kèm checklist init project)
├── modules/     # business logic, mỗi module tách user/ và admin/ — xem docs/module-pattern.md
├── rooms/       # Colyseus rooms (realtime)
├── seeds/       # `yarn seed` chạy tuần tự mọi seed
├── migrations/  # sinh bởi `yarn db:generate` — không sửa tay
└── index.ts     # entrypoint, loadControllers() tự quét mọi *.controller.ts
```

| Module         | Nội dung                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth/`        | `User`, `Admin`, `Player`, `GameServer`, session, đăng nhập Play Games Services v2 (Android) + Google idToken (PC), xoá tài khoản (chính sách Google Play), rate limit. User 1:N player (hiện tại 1:1, tự tạo lúc login) |
| `master-data/` | Config key-value (client version, session, player), validate theo key                                                                                                                                                    |
| `maps/`        | `GameMap` — metadata map, spawn, số người/kênh                                                                                                                                                                           |

Realtime: room `world` (`src/rooms/world/`) — 1 room = 1 kênh của 1 map. Dùng **Colyseus Netcode**
(`defineInput` + `setFixedTimestep`, client predict/reconcile) — xem mục 7 của `src/core/README.md`.
Hàm trong `src/rooms/**/simulation/*.step.ts` là hợp đồng với client Unity: sửa ở đây thì phải sửa
bản C# tương ứng (cùng thứ tự phép tính, cùng hằng số), không dùng thời gian thực/random trong step.

## Conventions

- Luôn dùng `yarn`, không `npm run`.
- Commit theo Conventional Commits (husky + commitlint), pre-commit chạy eslint + prettier.
- Controller viết tường minh từng endpoint — **không** dùng generic CRUD controller factory.
- `BaseService` mirror 1-1 các hàm của `BaseRepository` (cùng tên, cùng object param).
- Mọi method repository nhận 1 object param; `.from(table)` chỉ viết trong repo sở hữu bảng đó.
- ≥ 2 thao tác ghi DB → `withTransaction`, truyền `tx` vào mọi lệnh.
- Lỗi nghiệp vụ trong service: `serviceError(message, status, ResponseCode.X)`.
- Phần admin: chữ `admin` đứng đầu tên file/export/endpoint key, path `/admin/...`.
- Luxon cho thời gian (`DateTime.now()`), không `new Date()` rải rác.
- Thêm bảng chứa dữ liệu người chơi → cập nhật `AccountDeletionService.purgeUserData` (xoá tài khoản).
- Endpoint public (không cần đăng nhập) nhạy cảm → gắn `createRateLimitMiddleware(...)`.
- Thu hồi quyền chơi (ban/xoá/logout...) → gọi `playerKickService` sau khi ghi DB để đá player đang online.
- Không đặt field `sessionId` trong payload `onAuth` của room (Colyseus sẽ lấy làm `client.sessionId`).
- `.env.*` luôn commit ở dạng đã mã hoá (dotenvx); private key nằm trong Windows Credential Manager.

## Lệnh hay dùng

```bash
yarn dev          # chạy server (tsx watch)
yarn typecheck && yarn lint && yarn test
yarn db:generate  # sau khi sửa entity
yarn db:migrate && yarn seed
yarn smoke        # test end-to-end khi server đang chạy
```
