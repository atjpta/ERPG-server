# Tương tác giữa các room

## 1. Nguyên tắc và trách nhiệm

Server chỉ có **hai room**; mỗi player giữ hai kết nối (world + global), đều gắn với một `serverId`
(`options.serverId` bắt buộc và phải khớp token, kiểm trong `AuthenticatedPlayerRoom.onAuth`).

**Mỗi game server có một runtime riêng, một process chạy một hay nhiều server.** `GAME_SERVER_CODES` (env, cách nhau bằng dấu phẩy; không có thì
`GAME_SERVER_CODE`, rồi server mặc định) ghim process vào các dòng `game_servers` lúc khởi động (`pinGameServers` trong `src/rooms/index.room.ts`). Mỗi server có
một `RoomRuntimeService` (`roomRuntimes.of(serverId)`, các room lấy bằng `this.runtime`): mọi room của server đó (global, world, dungeon)
chung runtime nên **dữ liệu người chơi được dùng chung trong bộ nhớ**, không còn RPC đồng bộ giữa hai room. Tách một server ra process riêng
chỉ là đổi danh sách `GAME_SERVER_CODES`. Nhiều game server = nhiều process; Redis (khi có
`REDIS_URI`) chỉ làm kênh nhắn tin (kick, đổi tên, rate limit, nonce) chứ không để ghép room giữa các process.

| Thành phần              | Trách nhiệm                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `WorldRoom` (`world`)   | Người chơi trong map, chiến đấu, phần thưởng, chuyển map; `filterBy(["serverId","mapCode"])`                         |
| `WorldRoom` (`dungeon`) | **Cùng class `WorldRoom`**, đăng ký lần hai với `filterBy(["serverId","instanceId"])`: mỗi lượt dungeon một instance |
| `GlobalRoom`            | Một room / `serverId`: chat, party, bạn bè, thư, túi đồ / trang bị / thuộc tính, điều phối vào dungeon               |
| `RoomRuntimeService`    | `rooms/runtime/runtime.room.ts`: runtime chung của một game server — giữ `players` (một `PlayerRuntime` cho mỗi player online), `parties`, `friends` và là cổng duy nhất để hai room gọi nhau |

`dungeon` là lựa chọn có chủ đích: một biến thể đăng ký (instance riêng) của `WorldRoom`, **không** phải room thứ ba.

Mở rộng sau này (guild, ...) là module mới trong `global`. World và global không import nhau: DTO, enum dùng chung nằm ở `src/modules`, việc nhờ room kia làm gì đều đi qua
`room.runtime` (`RoomRuntimeService` của game server).

## 2. Dữ liệu người chơi dùng chung: `PlayerRuntime`

Mỗi player online có đúng một `PlayerRuntime` (`room.runtime.players.get(playerId)`), gồm 4 **nhóm** dữ liệu lưu
(`wallet`, `bag`, `progress`, `place`), stats dẫn xuất, `presence` (đang ở world room nào), `party` và `revision`.

- **Vòng đời:** `attach(playerId, user)` / `detach(playerId, user)`, đếm theo bên dùng (`global:<sessionId>`,
  `world:<roomId>`). Bên đầu tiên nạp từ DB, bên cuối gỡ ra thì lưu lần cuối rồi giải phóng. Đổi map: world mới `attach`
  trước khi world cũ `detach` nên object liên tục, không đọc lại DB.
- **Sửa một bước, đồng bộ:** `mutate(runtime, group, change, { critical })` — không `await` giữa kiểm tra và ghi.
  `credit` / `debit` cho ví, `PlayerDataWorldService.apply` cho item / điểm.
- **Sửa nhiều bước hoặc cần ghi DB ngay:** `transact(playerId, (draft, tx) => ...)` — sửa bản nháp, làm việc DB
  (tạo thư...) trong cùng transaction `tx`; lỗi thì rollback, `throw new TransactAbort(result)` để trả kết quả lỗi nghiệp vụ.
  Mail gửi / nhận / COD, cường hoá, mặc đồ đều là một `transact`.
- **Lưu:** thao tác `transact` ghi ngay; `mutate(..., { critical })` gom ≤ 500 ms; phần còn lại (vị trí, HP/MP, exp, tiến độ quest)
  autosave mỗi `player_config.autosaveSeconds` (30 giây) cho từng player, lệch ngẫu nhiên giữa các player để không dồn vào cùng một nhịp, chỉ ghi nhóm đổi trong một câu UPDATE có khoá `revision`. Tắt server
  (`SIGTERM`) → `onBeforeShutdown` gọi `flushAll()`. Chết đột ngột: mất tối đa một chu kỳ autosave của dữ liệu không quan trọng.
- **Thông báo cho client:** runtime phát sự kiện (`walletChanged`, `bagChanged`, `bagGranted`, `presenceChanged`,
  `partyChanged`); mỗi room tự đăng ký và gửi push (global gửi `inventory` / `attributes`, world gửi `wallet`).
- **Vị trí:** `PlayerWorldState` (Schema, 40Hz) giữ x / y / hướng / hp / mp; world room đăng ký `capturePlace` để runtime chụp
  khi lưu. Level / exp ghi thẳng vào runtime.

## 3. Hai room gọi nhau thế nào

Vì chung process nên không có RPC giữa hai room (`callRoom` / `createRpcRunner` đã bỏ): mọi giao tiếp đi qua `room.runtime` (`RoomRuntimeService` của game server) (dữ liệu dùng chung + cổng của từng room):

| Việc                                           | Cách làm                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| World báo vị trí / rời world cho global        | `room.runtime.players.setPresence` / `clearPresence`; global đăng ký `presenceChanged` (báo bạn bè, rời party khi rời hẳn) |
| Global đổi party của player                    | `room.runtime.players.setParty`; world đăng ký `partyChanged` và cập nhật `PlayerWorldState`                              |
| Thưởng quái, quest, thoại, dùng bình           | World sửa runtime trực tiếp; global tự gửi lại `inventory` khi nhận `bagChanged`                                          |
| Chủ party vào dungeon / "đi lại"               | World gọi `room.runtime.launchDungeon(request)`; global đăng ký cổng bằng `registerGlobal`                |
| Global kiểm tra / đưa từng thành viên vào dungeon | `room.runtime.checkDungeonEntry` / `enterDungeon` theo `presence.worldRoomId`; world đăng ký cổng bằng `registerWorld`  |

Cổng được đăng ký lúc `onCreate` và gỡ lúc `onDispose` của room; room đích không còn thì trả `ROOM_UNAVAILABLE`.

### Quy trình vào dungeon của cả party

1. World của chủ gọi `room.runtime.launchDungeon(...)`.
2. Global tạo party 1 người nếu chủ chưa có, kiểm tra nhóm.
3. `room.runtime.checkDungeonEntry` trên world của từng thành viên (level, còn sống, không đang ở dungeon khác...).
4. Nếu đều đạt, tạo `instanceId` chung, ghi `dungeonExpectationService`, rồi `enterDungeonInstance` cho từng thành viên
   (đổi map = join room `dungeon` với `instanceId` đó).
5. Có lỗi: push `partyDungeonDenied` cho cả party.

Đây chưa phải giao dịch chuyển room nguyên tử: một người có thể đã chuyển trong khi người khác lỗi.

## 4. Command và service đặt ở đâu?

- Hành động từ client hoặc lifecycle của room được xử lý bởi command, mỗi class một file.
- Logic chỉ phục vụ một hành động nằm trong command đó; không tạo service để bọc nguyên handler.
- Xử lý tái sử dụng (truy vấn dữ liệu, gửi push cho party...) nằm trong service.
- Logic nghiệp vụ thuần dùng cả API lẫn room nằm ở `src/modules/*/services`; thao tác trên túi / trang bị / điểm là method của `PlayerRuntime` (`runtime.fork(draft)` để chạy trên bản nháp của `transact`).

Chi tiết và cách thêm module mới vào room: [Quy tắc command](room-command-pattern.md).

## 5. Thêm tính năng mới: module trong room, không phải room mới

Thêm friend/guild/... là **module mới trong `global`** (hoặc `world/modules/<feature>` nếu gắn với map và state realtime);
xem [Thêm module mới vào room](room-command-pattern.md#thêm-module-mới-vào-room). Chỉ tạo room mới khi cần vòng đời và state
riêng thật sự, kèm: đăng ký ở `src/rooms/index.room.ts`, kế thừa `AuthenticatedPlayerRoom`, `@SdkRoom` với join option có
`serverId`, enum `<Room>ClientMessage` / `<Room>Message` trong `<room>/types/<room>-message.type.ts`, và đăng ký cổng vào `room.runtime` (`RoomRuntimeService` của game server) nếu room khác cần nhờ nó làm gì.

## 6. Chạy nhiều game server

Mỗi game server thuộc đúng một process (`GAME_SERVER_CODES`); một process có thể phụ trách nhiều server, và muốn tách thì đổi danh sách rồi khởi động lại (dữ liệu nằm ở DB). Client được trỏ tới process đúng (định tuyến phía hạ tầng).
Khi có `REDIS_URI`, process dùng `selectProcessIdToCreateRoom` để room luôn tạo ở chính nó, và lúc khởi động cảnh báo nếu
global room của server này đang chạy ở process khác. Không nên chạy hai process cho cùng một game server: dữ liệu người chơi
trong bộ nhớ sẽ không còn một nguồn.
