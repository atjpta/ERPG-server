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
| `friends/`                     | Bạn bè trong 1 game server: `friendships` (lời mời + quan hệ), `player_blocks` (chặn một chiều); logic room ở `rooms/global/modules/friend`                                                                                                                                         |
| `mails/`                       | Hộp thư: `mails` (một dòng cho mỗi người nhận), `mail_templates` (vi/en), `mail_broadcasts`; đính kèm dùng chung kiểu `Reward`; logic room ở `rooms/global/modules/mail`                                                                                                            |
| `player/`                      | Nhân vật: `player_states`, chỉ số, túi đồ (dữ liệu runtime của player online nằm ở `src/rooms/runtime/modules/player`, xem `docs/room-interactions.md`)                                                                           |
| `npcs/` `dialogues/` `quests/` | NPC dùng chung nhiều map, đồ thị thoại + rule chọn thoại theo hoàn cảnh, quest hero/side/daily (daily sinh theo level mỗi ngày) — data-driven, text qua key locale — xem `docs/content-authoring.md`                                                                                |

Realtime: **chỉ có 2 room**, mỗi player giữ 2 kết nối (đều bắt buộc `options.serverId` khớp token):

- `world` (`src/rooms/world/`) — 1 room = 1 kênh của 1 map trong 1 game server (`filterBy(["serverId","mapCode"])`).
  Dùng **Colyseus Netcode** (`defineInput` + `setFixedTimestep`, client predict/reconcile) — xem mục 7 của
  `src/core/README.md`. `dungeon` **không phải room thứ ba**: là lần đăng ký thứ hai của chính class `WorldRoom`
  (`filterBy(["serverId","instanceId"])`) để mỗi lượt dungeon là một instance riêng.
- `global` (`src/rooms/global/`) — 1 room / `serverId`, không có state Schema (dữ liệu chạy nằm ở `src/rooms/runtime`): chat, party, presence, điều phối vào dungeon.
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
- Mọi thứ trả cho client (API, response/push của room, hàm cổng giữa room) dùng envelope `Result` `{ success, data, code, message, error }`; lỗi chỉ trả mã lỗi (enum theo domain: `CommonCode` ở core, `AuthErrorCode`, `PartyErrorCode`...), không text tự do — xem `docs/response-format.md`.
- Message room từ client là Request/Response: command khai `static readonly message = <Room>ClientMessage.X` và **luôn gán `this.result`** (`Response.success(data)` hoặc `Response.error(Code)`; không gán thì client nhận `Response.success()` rỗng). Không `client.sendSuccess` để trả lời, không dùng `ctx.reject`/`validate()` của Colyseus cho lỗi nghiệp vụ. Chỉ thông báo server chủ động (`WorldMessage`/`GlobalMessage`) mới đi qua `client.sendSuccess`/`sendError`/`broadcastSuccess`.
- Mỗi game server có một runtime riêng (`RoomRuntimeService`, `roomRuntimes.of(serverId)`; trong room là `this.runtime`); process phụ trách các server trong `GAME_SERVER_CODES` (một hay nhiều, mặc định `GAME_SERVER_CODE`). Mọi room của một server chung runtime nên **không có RPC giữa các room**: mọi giao tiếp đi qua `room.runtime`: dữ liệu chạy dùng chung (`room.runtime.players` / `.parties` / `.friends`, kèm sự kiện `bagChanged`, `walletChanged`, `presenceChanged`, `partyChanged`) và cổng của từng room (`registerWorld` / `registerGlobal`, gọi bằng `launchDungeon`, `checkDungeonEntry`, `enterDungeon`). Thêm module vào room: xem mục "Thêm module mới vào room" trong `docs/room-command-pattern.md`.
- Dữ liệu người chơi đang online chỉ đổi qua `PlayerRuntimeService`: `mutate` (một bước, đồng bộ, không `await` giữa kiểm tra và ghi) hoặc `transact` (nhiều bước / cần DB — bản nháp + một transaction, `throw new TransactAbort(result)` để huỷ). Không ghi `player_states` trực tiếp lúc player đang chơi.
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
yarn load-test    # đo tải: BOTS=50,100,200 HOLD=20 yarn load-test (CLEANUP=1 để xoá bot) — xem đầu scripts/load-test.ts
yarn test:integration  # test tích hợp (đồng thời / timeout / restart) trên DB dev, không cần server — xem scripts/tests/README.md
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
- Dữ liệu chạy dùng chung trong bộ nhớ process nằm ở `src/rooms/runtime` (`runtime.room.ts` = `RoomRuntimeService`, kèm `modules/player`, `modules/party`, `modules/friend`, `modules/dungeon` (mỗi module có `enums/`, `types/`, `constants/`, `services/`, `runtime/` như world và global) và `types/`): `room.runtime.players` (`PlayerRuntime`), `.parties` (`PartyRuntime`), `.friends`. Runtime là tầng của rooms: import được `core` và `modules`, `modules` không import runtime. State Schema (`*.state.ts`) và runtime chỉ đổi dữ liệu và trả kết quả; gửi message client, push event và báo room khác (sự kiện runtime, cổng của `room.runtime` (`RoomRuntimeService` của game server)) do command / service làm (vd `partyGlobalService`), không đặt trong state.
- Player data: `PlayerRuntime` (`src/rooms/runtime/modules/player`) holds wallet, bags, equipment, attribute/skill points, level/exp, quests, flags and the last saved place for each online player; the world and global rooms `attach`/`detach` by user label (`global:<sessionId>`, `world:<roomId>`) and read/write the same object. `PlayerWorldState` exposes it through getters and keeps only tick-by-tick fields (position, hp/mp, cooldowns) in the Schema (`capturePlace` feeds the runtime when saving). Global requests (inventory, equipment-upgrade, attributes, mail) are one `transact`; world rewards use `mutate` / `PlayerDataWorldService.apply`. Pushes follow runtime events (global sends `inventory`/`attributes` on `bagChanged`, world sends `wallet` on `walletChanged`). Autosave every `player_config.autosaveSeconds`, critical changes within 500 ms or immediately (`transact`), `flushAll()` on shutdown. See `src/rooms/global/README.md`.
- Global mirrors world: lifecycle in the room file, base `player.global.command.ts` at the room root, room-level `schemas/` (server-only state), `services/` and `types/` (the two message enums), with features under `global/modules/<feature>` (`chat`, `party`, `dungeon-launch`, `player-data`; each with commands/services/validators/types). There is no separate party or chat room.
- Party and chat room workflow (state Schemas, commands, notify/delivery orchestration), DTOs and helpers live in `rooms/global/modules/*`, not `modules/party`; pure business logic reused outside the room (e.g. party loot split in `modules/rewards`) belongs in `src/modules`. The world and global rooms never import each other (no `<room>.shared.ts`): DTOs and enums both need live in `src/modules` (e.g. `modules/equipment/interfaces`, `modules/rewards/interfaces`) and asking the other room for work goes through `room.runtime` (`RoomRuntimeService` của game server). Multi-room workflows are modules of `global` (e.g. `global/modules/dungeon-launch`), there is no `rooms/coordinators`.
- Do not add a world-party integration wrapper: the world reads party from `PlayerRuntime.party`; shared player-party processing belongs in `world/modules/players/services`.
- Global room owns party membership and loot mode (written to `PlayerRuntime.party`; world listens to `partyChanged`). World computes and applies kill rewards locally with `shareKillReward` (no cross-room call on the kill path); the round-robin cursor is per (world room, party).

- Room services (`rooms/**/services`) only orchestrate: call other services, send messages, or handle room-specific workflow. Pure business logic (inventory ops, equipment upgrade, loot split...) lives in `src/modules/*/services`; logic used by a single command is written in that command; logic that only reads/changes a state Schema is a method of that Schema (e.g. `PlayerRuntime.takeByCode`, `PlayerWorldState.checkConsumable`).
- Each room command class (including abstract commands) has its own `*.command.ts` file. Action-specific handling belongs in the command, not a service wrapper. Services hold reused processing or capabilities called elsewhere. See `docs/room-command-pattern.md`.
- Client message commands declare their key as `static readonly message = <Room>ClientMessage.KEY` (one `<Room>ClientMessage` + one `<Room>Message` push enum per room folder) and set `this.result` (Request/Response); `.room.ts` loads its directory with `await loadRoomMessages(...)` at module scope and assigns the result to `messages`. Colyseus registers/binds handlers per room instance. Do not add manual message maps or static message keys to lifecycle/timer/abstract commands. Keep message enums for client synchronization.
