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

Realtime: **chỉ có 2 room**, mỗi player giữ 2 kết nối (đều bắt buộc `options.serverId` khớp token):

- `world` (`src/rooms/world/`) — 1 room = 1 kênh của 1 map trong 1 game server (`filterBy(["serverId","mapCode"])`).
  Dùng **Colyseus Netcode** (`defineInput` + `setFixedTimestep`, client predict/reconcile) — xem mục 7 của
  `src/core/README.md`. `dungeon` **không phải room thứ ba**: là lần đăng ký thứ hai của chính class `WorldRoom`
  (`filterBy(["serverId","instanceId"])`) để mỗi lượt dungeon là một instance riêng.
- `global` (`src/rooms/global/`) — 1 room / `serverId`, state `GlobalState` (Schema nhưng không field `@type` nên không sync, chỉ giữ hồ sơ / presence / party trong bộ nhớ server): chat, party, presence, điều phối vào dungeon.
  Tính năng mới kiểu social (friend, guild, mail...) là module mới trong `global`, không thêm room.

Mọi thao tác kiểu hỏi-đáp của client là **Request/Response** của Colyseus 0.18 (`await room.Request<T>(...)` trên Unity SDK

> = 0.18.3): command gán `this.result = Response.success(data)` / `Response.error(Code)`, handler trả envelope `Result`. Enum `*Message` chỉ còn
> cho thông báo server chủ động đẩy xuống (push). Xem `docs/room-messages.md`, `docs/room-command-pattern.md`.
> Hàm trong `src/rooms/**/simulation/*.step.ts` là hợp đồng với client Unity: sửa ở đây thì phải sửa
> bản C# tương ứng (cùng thứ tự phép tính, cùng hằng số), không dùng thời gian thực/random trong step.

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
- Mọi thứ trả cho client (API, response/push của room, RPC giữa room) dùng envelope `Result` `{ success, data, code, message, error }`; lỗi chỉ trả mã lỗi (enum theo domain: `CommonCode` ở core, `AuthErrorCode`, `PartyErrorCode`...), không text tự do — xem `docs/response-format.md`.
- Message room từ client là Request/Response: command khai `static readonly message = <Room>ClientMessage.X` và **luôn gán `this.result`** (`Response.success(data)` hoặc `Response.error(Code)`; không gán thì client nhận `Response.success()` rỗng). Không `client.sendSuccess` để trả lời, không dùng `ctx.reject`/`validate()` của Colyseus cho lỗi nghiệp vụ. Chỉ thông báo server chủ động (`WorldMessage`/`GlobalMessage`) mới đi qua `client.sendSuccess`/`sendError`/`broadcastSuccess`.
- Gọi giữa các room dùng `callRoom(roomId, XCommand, payload, { timeoutMs? })` (mặc định 3s; RPC gộp nhiều bước như mở dungeon dùng timeout dài hơn). Thêm module vào room: xem mục "Thêm module mới vào room" trong `docs/room-command-pattern.md`.
- Client Unity gọi server qua SDK sinh tự động (`yarn unity:network`): endpoint khai báo option `sdk`, room tự suy từ command (thêm `@SdkMessage({ response, errors, note })` / `@SdkRoom` để ghi kiểu response, mã lỗi, cách join; sinh `<Room>RoomClient` với hàm `async Task<Result<T>>` cho mỗi request), mã lỗi có JSDoc từng member — xem `docs/client-sdk.md`.
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

- World room lifecycle (`onCreate` / `onJoin` / `onLeave` / `onDispose`) is written in `src/rooms/world/world.room.ts`; shared pieces live in `src/rooms/world/{chains,enums,schemas,services,types,utils}` and the base `player.world.command.ts` at the room root.
- World features live in `src/rooms/world/modules/<feature>` with their Colyseus schemas in `schemas/`; only aggregate `WorldState` stays in `world/schemas`.

- Thư mục trong module room theo mục đích: `interfaces/` (DTO `*.message.ts` gửi client), `enums/`, `schemas/` (Colyseus Schema / state), `types/` (kiểu chỉ dùng trong server), `services/`, `commands/`, `validators/` — xem `docs/room-command-pattern.md`.
- State Schema (`*.state.ts`, kể cả server-only như `PartiesState`/`PartyState`) chỉ đổi dữ liệu và trả kết quả; gửi message client, push event và báo room khác (`callRoom`) do command / service làm (vd `partyGlobalService`), không đặt trong state.
- PlayerData split: `global/modules/player-data` (state + persistence; client requests live in `inventory`, `equipment-upgrade`, `attributes`, world room registry in `world-registry`) owns bags, equipment, attribute/skill points and allocated attributes (all inventory/attribute client requests and `inventory`/`attributes` pushes are global; global is the only DB writer while playing and saves those columns immediately). World owns position, hp/mp, level/exp, wallet, quests, flags; it keeps a read-only replica of global's part (`PlayerWorldState.applyPlayerData`) and changes it only through `playerDataWorldService` (`apply`/`queue`/`sync`) → `ApplyPlayerChangesGlobalCommand` / `SyncPlayersGlobalCommand`. Global asks world for wallet/level via `PullPlayerFieldsWorldCommand`/`DebitWalletWorldCommand`. One `player_states.revision`. See `src/rooms/global/README.md`.
- Global mirrors world: lifecycle in the room file, base `player.global.command.ts` at the room root, room-level `schemas/` (server-only state), `services/` and `types/` (the two message enums), with features under `global/modules/<feature>` (`chat`, `party`, `dungeon-launch`, `player-data`; each with commands/services/validators/types). There is no separate party or chat room.
- Party and chat room workflow (state Schemas, commands, notify/delivery orchestration), DTOs and helpers live in `rooms/global/modules/*`, not `modules/party`; pure business logic reused outside the room (e.g. party loot split in `modules/rewards`) belongs in `src/modules`. Peer rooms import only public `<room>.shared.ts` entrypoints and the peer's RPC **command classes** (to call `callRoom(roomId, XCommand, payload)` / `callRoom(serverId, XCommand, payload)`), never the peer's services, schemas or other implementation. Party and chat master-data config schemas and the loot-mode enum belong to `modules/master-data` so modules never import rooms. Multi-room workflows are modules of `global` (e.g. `global/modules/dungeon-launch`), there is no `rooms/coordinators`.
- World player commands call `callRoom(...)` directly; do not add a world-party integration wrapper. Shared player-party processing and public RPC capabilities belong in `world/modules/players/services`.
- Global room owns party membership and loot mode (pushed to world via `PartySetPlayerPartyWorldCommand`). World computes and applies kill rewards locally with `shareKillReward` (no RPC on the kill path); the round-robin cursor is per (world room, party).

- Room services (`rooms/**/services`) only orchestrate: call other services, send messages / `callRoom`, or handle room-specific workflow. Pure business logic (inventory ops, equipment upgrade, loot split...) lives in `src/modules/*/services`; logic used by a single command is written in that command; logic that only reads/changes a state Schema is a method of that Schema (e.g. `PlayerDataState.takeByCode`, `PlayerWorldState.checkConsumable`).
- Each room command class (including abstract commands) has its own `*.command.ts` file. Action-specific handling belongs in the command, not a service wrapper. Services hold reused processing or capabilities called elsewhere. See `docs/room-command-pattern.md`.
- Client message commands declare their key as `static readonly message = <Room>ClientMessage.KEY` (one `<Room>ClientMessage` + one `<Room>Message` push enum per room folder) and set `this.result` (Request/Response); `.room.ts` loads its directory with `await loadRoomMessages(...)` at module scope and assigns the result to `messages`. Colyseus registers/binds handlers per room instance. Do not add manual message maps or static message keys to lifecycle/timer/abstract commands. Keep message enums for client synchronization.
