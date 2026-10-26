# CLAUDE.md

Server cho **ERPG** — MMORPG pixel top-down. Client làm bằng **Unity**, build ra Android (Google Play)
và PC. Server: Colyseus 0.18 (REST + realtime room) · PostgreSQL/Drizzle · Zod · TypeScript.

## Cấu trúc

```
src/
├── configs/     # env, postgres, redis (tuỳ chọn), timezone
├── core/        # hạ tầng dùng chung — xem src/core/README.md (kèm checklist init project)
|-- apis/         # HTTP admin/<module> and user/<module>: controllers, validators only (controllers may call repos directly)
|-- modules/     # business logic shared by API and rooms; see docs/module-pattern.md
├── rooms/       # Colyseus rooms (realtime)
├── seeds/       # `yarn seed` chạy tuần tự mọi seed
├── migrations/  # sinh bởi `yarn db:generate` — không sửa tay
└── index.ts     # entrypoint, loadControllers() tự quét mọi *.controller.ts
```

| Module                         | Nội dung                                                                                                                                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/`                        | `User`, `Admin`, `Player`, `GameServer`, session, đăng nhập Play Games Services v2 (Android) + Google idToken (PC), xoá tài khoản (chính sách Google Play), rate limit. User 1:N player (tối đa `player_config.maxCharacters`, chọn ở `/user/players`)                                        |
| `master-data/`                 | Config key-value (client version, session, player), validate theo key                                                                                                                                                                                                                         |
| `maps/`                        | `GameMap` từ file `data/<code>.map.json` (Unity export): spawn point, collider, monster spawn, NPC đặt chỗ, vật thể tương tác (portal/thu thập/biển báo), `minLevel`, dungeon (chamber/phase); map chưa có file thì seed tạo placeholder + cảnh báo — xem `docs/map-file-format.md`           |
| `classes/`                     | Class nhân vật (`baseAttributes`, `baseStats`, cây `nextClassCodes`); 4 class khởi đầu chọn lúc `POST /user/players`                                                                                                                                                                          |
| `items/`                       | Catalog item: trang bị là template (biome + class + loại), material/consumable stack được                                                                                                                                                                                                     |
| `equipment/`                   | Roll/tính chỉ số trang bị, set, cường hoá, tinh hoá, phân rã — mọi bảng số nằm ở master data `equipment_*_config`                                                                                                                                                                             |
| `friends/`                     | Bạn bè trong 1 game server: `friendships` (lời mời + quan hệ), `player_blocks` (chặn một chiều); logic room ở `rooms/global/modules/friend`                                                                                                                                                   |
| `mails/`                       | Hộp thư: `mails` (một dòng cho mỗi người nhận), `mail_templates` (vi/en), `mail_broadcasts`; đính kèm dùng chung kiểu `Reward`; logic room ở `rooms/global/modules/mail`                                                                                                                      |
| `gift-codes/`                  | Gift code dùng chung: `gift_codes` + `gift_code_redemptions` (mỗi nhân vật 1 lần, `maxUses`, thời hạn, giới hạn game server); nhập qua request `giftCodeRedeem` của `global`, quà gửi bằng thư hệ thống `gift_code` (không cộng thẳng vào túi); logic room ở `rooms/global/modules/gift-code` |
| `player/`                      | Nhân vật: `player_states`, chỉ số, túi đồ (dữ liệu runtime của player online nằm ở `src/rooms/global/modules/player-data`, xem `docs/room-interactions.md`)                                                                                                                                   |
| `npcs/` `dialogues/` `quests/` | NPC dùng chung nhiều map, đồ thị thoại + rule chọn thoại theo hoàn cảnh, quest hero/side/daily (daily sinh theo level mỗi ngày) — data-driven, text qua key locale — xem `docs/content-authoring.md`                                                                                          |

Realtime: **chỉ có 2 room**, mỗi player giữ 2 kết nối (đều bắt buộc `options.serverId` khớp token):

- `world` (`src/rooms/world/`) — 1 room = 1 kênh của 1 map trong 1 game server (`filterBy(["serverId","mapCode"])`).
  Dùng **Colyseus Netcode** (`defineInput` + `setFixedTimestep`, client predict/reconcile) — xem mục 7 của
  `src/core/README.md`. `dungeon` **không phải room thứ ba**: là lần đăng ký thứ hai của chính class `WorldRoom`
  (`filterBy(["serverId","instanceId"])`) để mỗi lượt dungeon là một instance riêng.
- `global` (`src/rooms/global/`) — 1 room / `serverId`, không có state Schema (dữ liệu chạy nằm ở `src/rooms/global/modules/{player-data,party,friend,dungeon-launch}`): chat, party, presence, điều phối vào dungeon.
  Tính năng mới kiểu social (friend, guild, mail...) là module mới trong `global`, không thêm room.

Mọi thao tác kiểu hỏi-đáp của client là **Request/Response** của Colyseus 0.18 (`await room.Request<T>(...)` trên Unity SDK

> = 0.18.3): command gán `this.result = Response.success(data)` / `Response.error(Code)`, handler trả envelope `Result`. Enum `*Message` chỉ còn
> cho thông báo server chủ động đẩy xuống (push). Xem `docs/room-messages.md`, `docs/room-command-pattern.md`.
> Hàm trong `src/modules/**/simulation/*.step.ts` là hợp đồng với client Unity: sửa ở đây thì phải sửa
> bản C# tương ứng (cùng thứ tự phép tính, cùng hằng số), không dùng thời gian thực/random trong step.

## Conventions

- Text hiển thị (tên NPC/quest/thoại...) không lưu ở server — chỉ code/text key, client tra locale.
- Layout map (vị trí quái, spawn, NPC, collider) chỉ nằm ở file `.map.json`, không hardcode trong seed/code.
- Luôn dùng `yarn`, không `npm run`.
- Commit theo Conventional Commits (husky + commitlint), pre-commit chạy eslint + prettier.
- Controller viết tường minh từng endpoint — **không** dùng generic CRUD controller factory.
- Không có `BaseService`: CRUD cơ bản thì controller / command gọi thẳng repo; logic dùng ≥ 2 nơi / phức tạp / nặng viết service trong `src/modules/*/services`.
- Mọi method repository nhận 1 object param; `.from(table)` chỉ viết trong repo sở hữu bảng đó.
- ≥ 2 thao tác ghi DB → `withTransaction`, truyền `tx` vào mọi lệnh.
- Ba lớp trả về, mỗi lớp một class ở `src/core/response/`: `Response<T>` (nội bộ: service / state / manager / cổng giữa room; `Response.success(data)` / `Response.error(code, errorData?)`, `abort` + `attempt` cho luồng nhiều bước), `HttpResponse` (controller: `HttpResponse.from(ctx, response)`), `RoomResponse` (room: `reply` cho Request/Response, `send` / `sendError` / `broadcast` cho push). Hàm có thể thất bại vì nghiệp vụ trả `Response<T>` — không dùng `ErrorCode | undefined`, union `| ErrorCode` hay kiểu `*Failure`. Service / state không trả thẳng client. HTTP status của mã lỗi đăng ký ở `registerErrorCodes(enum, statuses)`. `*OrFail` của repo ném `Response.abort(code)`; `Response.fromThrown` đổi lỗi ném thành `Response` ở biên.
- Mọi thứ trả cho client (API, response/push của room) dùng envelope `Result` `{ success, data, code, message, error }` do `toEnvelope` dựng; lỗi chỉ trả mã lỗi (enum theo domain: `CommonCode` ở core, `AuthErrorCode`, `PartyErrorCode`...), không text tự do — xem `docs/response-format.md`.
- Message room từ client là Request/Response: command khai `static readonly message = <Room>ClientMessage.X` và **luôn gán `this.result`** (`Response.success(data)` / `Response.error(Code)` hoặc kết quả của service; không gán thì client nhận thành công rỗng). Không `RoomResponse.send` để trả lời, không dùng `ctx.reject`/`validate()` của Colyseus cho lỗi nghiệp vụ. Chỉ thông báo server chủ động (`WorldMessage`/`GlobalMessage`) mới đi qua `RoomResponse.send`/`sendError`/`broadcast`.
- Mỗi game server có một `GlobalRoom` giữ dữ liệu chạy của nó (`room.players`, `room.parties`, `room.friends`); process phụ trách các server trong `GAME_SERVER_CODES` (một hay nhiều, mặc định `GAME_SERVER_CODE`) và có vai trò `PROCESS_ROLES` (`global`, `world`; mặc định cả hai). Chỉ có MỘT đường chạy cho 1 hay N process: world room luôn dùng `PlayerStateManager.of(serverId)` (bản sao dữ liệu player, tạo bằng `new PlayerStateManager(upstream)`; global dùng `new PlayerStateManager()` làm dữ liệu chính và nhận lời gọi qua các hàm `host*`) và nói chuyện với global qua bus, kể cả khi cùng process (không cần Redis khi chỉ có 1 process). Room ở process khác nói chuyện qua `rooms/bus`: `callRoom(roomId, method, payload)` → hàm `rpc` của room đích (`launchDungeon`, `checkDungeonEntry`, `enterDungeon`, và `player*` cho dữ liệu player). Thêm module vào room: xem mục "Thêm module mới vào room" trong `docs/room-command-pattern.md`. Triển khai 1 hoặc N process (launcher `scripts/cluster.mjs`, reverse proxy, VPS 1 CPU): xem `docs/deployment.md`.
- Dữ liệu người chơi đang online chỉ đổi qua `PlayerStateManager`: `mutate` (một bước, đồng bộ, không `await` giữa kiểm tra và ghi) hoặc `transact` (nhiều bước / cần DB — bản nháp + một transaction, `throw new TransactAbort(result)` để huỷ). Không ghi `player_states` trực tiếp lúc player đang chơi.
- Client Unity gọi server qua SDK sinh tự động (`yarn unity:network`): endpoint khai báo option `sdk`, room tự suy từ command (thêm `@SdkMessage({ response, errors, note })` / `@SdkRoom` để ghi kiểu response, mã lỗi, cách join; sinh `<Room>RoomClient` với hàm `async Task<Result<T>>` cho mỗi request), mã lỗi có JSDoc từng member — xem `docs/client-sdk.md`.
- Phần admin: chữ `admin` đứng đầu tên file/export/endpoint key, path `/admin/...`.
- Phép tính thập phân (chỉ số, damage, reward, equipment) luôn đi qua `CalcService` (`src/core/calc/calc.service.ts`), không dùng driver hay `bignumber.js` trực tiếp. Bản dùng chung `calc` mặc định `native` (nhẹ), đổi bất cứ lúc nào bằng `calc.use("big")`. Chi phí nâng cấp, thưởng quái (gold / exp / drop) và chỉ số player / monster / trang bị luôn dùng BigNumber: mỗi hàm tính tạo `const calc = new CalcService("big")` (bản riêng, không đổi theo `calc.use`); damage chain dùng `calc` dùng chung. Giá trị nằm trên lưới 1e-8, làm tròn half-up 4 chữ số; hai driver cho kết quả giống hệt nhau (test `yarn test:integration calc`). Số thập phân luôn dùng dấu chấm, không parse chuỗi theo locale (`calc.of("1,5")` ném lỗi). Tiền / exp là số nguyên thì dùng số thường; đường nóng (`combatRoll`, hồi HP/MP mỗi tick) dùng số nguyên thường, không qua `calc`.
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

- `modules/<module>` only contains constants, entities, enums, interfaces, repositories, middlewares, schemas (Zod), seeds, state (`*.state.ts`, class names end with `State`), types, data and services; a class file holds only the class (types/enums/errors in their own folders).
- Core cannot import modules, API or rooms (including types); application adapters belong in rooms.
- Modules cannot import API or rooms. Rooms cannot import API. API roles share logic through modules.
- API admin/user files, exports and endpoint keys have the corresponding `admin`/`user` prefix.
- Application URLs start with `/admin/` or `/user/`. `loadControllers()` discovers only `src/apis`.

- `loadControllers()` returns `{ admin, user }`. Only `src/index.ts` mounts `/admin` and `/user` via `prefixEndpoints`; controllers use local resource paths.

- World room lifecycle (`onCreate` / `onJoin` / `onLeave` / `onDispose`) is written in `src/rooms/world/world.room.ts`; shared pieces live in `src/rooms/world/{services,types,utils}` and the base `player.world.command.ts` at the room root.
- Room là lớp vào cho client (giống controller của API): chỉ chứa command, validator, DTO `*.message.ts`, vòng đời room, `rpc` và phần điều phối cần `room` / `client`. Type, enum, mã lỗi, state (kể cả Colyseus Schema như `PlayerWorldState`, `MonsterWorldState`, `WorldState`), simulation (`*.step.ts`), chain / util thuần và logic dùng chung nằm ở `src/modules/<feature>` (`state/`, `types/`, `enums/`, `utils/`, `chains/`, `simulation/`); `modules` không import `rooms`.

- Thư mục trong module room theo mục đích: `interfaces/` (DTO `*.message.ts` gửi client), `enums/`, `types/` (kiểu chỉ dùng trong server), `services/`, `commands/`, `validators/` — xem `docs/room-command-pattern.md`.
- Dữ liệu chạy trong bộ nhớ nằm ở `src/rooms/global/modules/*` (global là chủ dữ liệu): `player-data` (`PlayerStateManager`: dữ liệu chính, phần nhận lời gọi từ world `host*` và phần bản sao phía world, gộp trong một class), `party` (`PartyStateManager`, `PartyState`), `friend` (`FriendStateManager`), `dungeon-launch` (`dungeon-expectation`); mỗi module có `enums/`, `types/`, `state/`, `services/`... như world và global. Mỗi game server một `GlobalRoom` giữ `players`, `parties`, `friends`. World room được import phần dữ liệu / dịch vụ / kiểu của `rooms/global` (không import command của global). State và các service trạng thái chỉ đổi dữ liệu và trả kết quả; gửi message client, push event và báo room khác (`callRoom` ở `rooms/bus`) do command / service làm (vd `partyGlobalService`), không đặt trong state.
- Player data: `PlayerState` (`src/rooms/global/modules/player-data`) holds wallet, bags, equipment, attribute/skill points, level/exp, quests, flags and the last saved place for each online player. Global is the owner. A world room (same process or not) always holds a replica (a `PlayerStateManager` built with `upstream`): reads come from the replica, wallet/bag writes are applied locally and sent to global (`PlayerStateManager.hostWrite`, idempotent by `eventId`), progress (quests, flags, level/exp) and place (x, y, hp, mp) are backed up to global every `player_config.autosaveSeconds` (jittered) and immediately on map change / leave. Global pushes wallet/bag/party changes down. `PlayerWorldState` exposes the state through getters and keeps only tick-by-tick fields in the Schema. Global requests (inventory, equipment-upgrade, attributes, mail) are one `transact`; world rewards use `PlayerStateOwner.credit/debit/applyOps`. Autosave every `player_config.autosaveSeconds`, critical changes within 500 ms or immediately (`transact`), `flushAll()` on shutdown. See `src/rooms/global/README.md`.
- Global mirrors world: lifecycle in the room file, base `player.global.command.ts` at the room root, room-level `schemas/` (server-only state), `services/` and `types/` (the two message enums), with features under `global/modules/<feature>` (`chat`, `party`, `dungeon-launch`, `player-data`; each with commands/services/validators/types). There is no separate party or chat room.
- Party and chat room workflow (state Schemas, commands, notify/delivery orchestration), DTOs and helpers live in `rooms/global/modules/*`, not `modules/party`; pure business logic reused outside the room (e.g. party loot split in `modules/rewards`) belongs in `src/modules`. Global never imports the world room and world does not import global commands (only its data managers / services / types): DTOs and enums both need live in `src/modules` (e.g. `modules/equipment/interfaces`, `modules/rewards/interfaces`) and asking the other room for work goes through `rooms/bus` (`callRoom`). Multi-room workflows are modules of `global` (e.g. `global/modules/dungeon-launch`), there is no `rooms/coordinators`.
- Data shapes held in memory are state classes in `src/modules/<module>/state` (suffix `State`), wrapping the persisted JSON without changing its storage shape: `WalletState`, `InventoryState`, `QuestLogState` (flags, quests, daily quests), `EquipmentInstanceState` (via `PlayerState.wallet` / `.bag` / `.questLog` / `.findOwned`), and for the world room `DungeonInstanceState`, `DialogueSessionsState`, `PendingSkillHitState`, `PartyLootState`. They only change data and return results; saving, messages and pushes belong to the owner / command.
- Do not add a world-party integration wrapper: the world reads party from `PlayerState.party`; shared player-party processing belongs in `world/modules/players/services`.
- Global room owns party membership and loot mode (written to `PlayerState.party`; world listens to `partyChanged`). World computes and applies kill rewards locally with `shareKillReward` (no cross-room call on the kill path); the round-robin cursor is per (world room, party).

- Room services (`rooms/**/services`) only orchestrate: call other services, send messages, or handle room-specific workflow. Pure business logic (inventory ops, equipment upgrade, loot split...) lives in `src/modules/*/services`; logic used by a single command is written in that command; logic that only reads/changes a state Schema is a method of that Schema (e.g. `PlayerState.takeByCode`, `PlayerWorldState.checkConsumable`).
- Each room command class (including abstract commands) has its own `*.command.ts` file. Action-specific handling belongs in the command, not a service wrapper. Services hold reused processing or capabilities called elsewhere. See `docs/room-command-pattern.md`.
- Client message commands declare their key as `static readonly message = <Room>ClientMessage.KEY` (one `<Room>ClientMessage` + one `<Room>Message` push enum per room folder) and set `this.result` (Request/Response); `.room.ts` loads its directory with `await loadRoomMessages(...)` at module scope and assigns the result to `messages`. Colyseus registers/binds handlers per room instance. Do not add manual message maps or static message keys to lifecycle/timer/abstract commands. Keep message enums for client synchronization.
