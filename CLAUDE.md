# CLAUDE.md

Server cho **ERPG** — MMORPG pixel top-down. Client làm bằng **Unity**, build ra Android (Google Play)
và PC. Server: Colyseus 0.18 (REST + realtime room) · PostgreSQL/Drizzle · Zod · TypeScript.

## Cấu trúc

```
src/
├── configs/     # env, postgres, redis (tuỳ chọn), timezone
├── core/        # hạ tầng dùng chung — xem src/core/README.md (kèm checklist init project)
|-- apis/         # HTTP admin/<module> and user/<module>: controllers, services, validators
|-- modules/     # business logic shared by API and rooms; see docs/module-pattern.md
├── rooms/       # Colyseus rooms (realtime)
├── seeds/       # `yarn seed` chạy tuần tự mọi seed
├── migrations/  # sinh bởi `yarn db:generate` — không sửa tay
└── index.ts     # entrypoint, loadControllers() tự quét mọi *.controller.ts
```

| Module                         | Nội dung                                                                                                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/`                        | `User`, `Admin`, `Player`, `GameServer`, session, đăng nhập Play Games Services v2 (Android) + Google idToken (PC), xoá tài khoản (chính sách Google Play), rate limit. User 1:N player (tối đa `player_config.maxCharacters`, chọn ở `/user/players`)                              |
| `master-data/`                 | Config key-value (client version, session, player), validate theo key                                                                                                                                                                                                               |
| `maps/`                        | `GameMap` từ file `data/<code>.map.json` (Unity export): spawn point, collider, monster spawn, NPC đặt chỗ, vật thể tương tác (portal/thu thập/biển báo), `minLevel`, dungeon (chamber/phase); map chưa có file thì seed tạo placeholder + cảnh báo — xem `docs/map-file-format.md` |
| `classes/`                     | Class nhân vật (`baseAttributes`, `baseStats`, cây `nextClassCodes`); 4 class khởi đầu chọn lúc `POST /user/players`                                                                                                                                                                |
| `items/`                       | Catalog item: trang bị là template (biome + class + loại), material/consumable stack được                                                                                                                                                                                           |
| `equipment/`                   | Roll/tính chỉ số trang bị, set, cường hoá, tinh hoá, phân rã — mọi bảng số nằm ở master data `equipment_*_config`                                                                                                                                                                   |
| `npcs/` `dialogues/` `quests/` | NPC dùng chung nhiều map, đồ thị thoại + rule chọn thoại theo hoàn cảnh, quest hero/side/daily (daily sinh theo level mỗi ngày) — data-driven, text qua key locale — xem `docs/content-authoring.md`                                                                                |

Realtime: room `world` (`src/rooms/world/`) — 1 room = 1 kênh của 1 map. Dùng **Colyseus Netcode**
(`defineInput` + `setFixedTimestep`, client predict/reconcile) — xem mục 7 của `src/core/README.md`.
Hàm trong `src/rooms/**/simulation/*.step.ts` là hợp đồng với client Unity: sửa ở đây thì phải sửa
bản C# tương ứng (cùng thứ tự phép tính, cùng hằng số), không dùng thời gian thực/random trong step.

## Conventions

- Text hiển thị (tên NPC/quest/thoại...) không lưu ở server — chỉ code/text key, client tra locale.
- Layout map (vị trí quái, spawn, NPC, collider) chỉ nằm ở file `.map.json`, không hardcode trong seed/code.
- Luôn dùng `yarn`, không `npm run`.
- Commit theo Conventional Commits (husky + commitlint), pre-commit chạy eslint + prettier.
- Controller viết tường minh từng endpoint — **không** dùng generic CRUD controller factory.
- `BaseService` mirror 1-1 các hàm của `BaseRepository` (cùng tên, cùng object param).
- Mọi method repository nhận 1 object param; `.from(table)` chỉ viết trong repo sở hữu bảng đó.
- ≥ 2 thao tác ghi DB → `withTransaction`, truyền `tx` vào mọi lệnh.
- Lỗi nghiệp vụ trong service: `serviceError(message, status, <Domain>ErrorCode.X)`.
- Mọi thứ trả cho client (API, message room, RPC giữa room) dùng envelope `Result` `{ success, data, code, message, error }`; lỗi chỉ trả mã lỗi (enum theo domain: `CommonCode` ở core, `AuthErrorCode`, `PartyErrorCode`...), không text tự do; room gửi qua `client.sendSuccess`/`client.sendError` — xem `docs/response-format.md`.
- Client Unity gọi server qua SDK sinh tự động (`yarn unity:network`): endpoint khai báo option `sdk`, room tự suy từ command (thêm `@SdkMessage` / `@SdkRoom` để ghi reply, mã lỗi, cách join), mã lỗi có JSDoc từng member — xem `docs/client-sdk.md`.
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
yarn typecheck && yarn lint
yarn db:generate  # sau khi sửa entity
yarn db:migrate && yarn seed
yarn smoke        # test end-to-end khi server đang chạy
```

## API/module boundaries

- `modules/<module>` only contains constants, entities, enums, repositories, middlewares, schemas (Zod), seeds, types, data and services.
- Core cannot import modules, API or rooms (including types); application adapters belong in rooms.
- Modules cannot import API or rooms. Rooms cannot import API. API roles share logic through modules.
- API admin/user files, exports and endpoint keys have the corresponding `admin`/`user` prefix.
- Application URLs start with `/admin/` or `/user/`. `loadControllers()` discovers only `src/apis`.

- `loadControllers()` returns `{ admin, user }`. Only `src/index.ts` mounts `/admin` and `/user` via `prefixEndpoints`; controllers use local resource paths.

- World lifecycle code lives directly in `src/rooms/world/{chains,commands,services,utils}`.
- World features live in `src/rooms/world/modules/<feature>` with their Colyseus schemas in `schemas/`; only aggregate `WorldState` stays in `world/schemas`.

- Party mirrors world: room-level lifecycle commands/services/aggregate schemas, with feature commands/services/validators/schemas under `party/modules/<feature>`.
- Party runtime logic, DTOs, schemas and helpers live in `rooms/party`, not `modules/party`. Peer rooms import only public `<room>.shared.ts` entrypoints and the peer's RPC **command classes** (to call `callRoom(roomId, XCommand, payload)`), never the peer's services, schemas or other implementation. Party master-data config schema and its loot-mode enum belong to `modules/master-data` so modules never import rooms. Multi-room workflows belong in `rooms/coordinators`.
- World player commands call `callRoom(...)` directly; do not add a world-party integration wrapper. Shared player-party processing and public RPC capabilities belong in `world/modules/players/services`.
- Party room owns membership, loot mode, round-robin cursor and allocation deduplication. World owns applying rewards; pending allocations must drain before saves/leaves.

- Each room command class (including abstract commands) has its own `*.command.ts` file. Action-specific handling belongs in the command, not a service wrapper. Services hold reused processing or capabilities called elsewhere. See `docs/room-command-pattern.md`.
- Client message commands declare their key as `static readonly message = ClientMessage.KEY`; `.room.ts` loads its directory with `await loadRoomMessages(...)` at module scope and assigns the result to `messages`. Colyseus registers/binds handlers per room instance. Do not add manual message maps or static message keys to lifecycle/timer/abstract commands. Keep message enums for client synchronization.
