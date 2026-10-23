# Room commands

Mỗi class command (kể cả abstract) nằm trong một file `*.command.ts` riêng, đặt tên như
`invite.party.command.ts`, `enhance-equipment.world.command.ts`, `on-create.global.command.ts`.

## Request/Response: command trả `result`

Mọi message client → server là **Request/Response** của Colyseus 0.18 (Unity SDK >= 0.18.3:
`await room.Request<T>(message, payload)`; JS SDK: `room.request(message, payload)`). Handler do
`loadRoomMessages()` sinh ra dispatch command rồi **trả `command.result`** — envelope `Result` chuẩn
(xem [định dạng trả về](response-format.md)).

- Thành công: `this.result = Response.success(data)` (không có data: `Response.success()`). Lỗi nghiệp vụ: `this.result = Response.error(<Domain>ErrorCode.X)`.
- Command không gán `result` thì client nhận `Response.success()` rỗng.
- Không dùng `client.sendSuccess` để trả lời, không dùng `ctx.reject` hay `validate()` của Colyseus cho lỗi nghiệp vụ
  (payload sai làm Colyseus đóng kết nối, trong khi ta muốn `INVALID_INPUT`).
- Exception ném ra trong `execute()` được đổi thành `Result` bằng `Response.fromError` (`core/utils/response.util.ts`):
  `serviceError(...)` → `Response.error(code)`, `PayloadRejected` → `INVALID_INPUT`, lỗi lạ → log + `INTERNAL_ERROR`.
- Message không có command → Colyseus trả lỗi giao thức `no_handler` (không phải `Result`; Unity: `RequestError`).
- Chỉ còn thông báo server chủ động (không có request đi kèm) mới dùng `client.sendSuccess` / `broadcastSuccess` với
  enum `WorldMessage` / `GlobalMessage`. Command có thể vừa trả `result` vừa đẩy thêm push (khai ở `@SdkMessage.replies`).
- Input di chuyển dùng `defineInput` (Netcode), không đi qua cơ chế này.

## `validate()`, `execute()`, guard

Command của một player trong room kế thừa `PlayerCommand` (`core/rooms/player.command.ts`), thường qua base mỏng của
từng room: `PlayerWorldCommand` (`this.player` là `PlayerWorldState`) hoặc `PlayerGlobalCommand` (`this.player` là
`PlayerDataState`). Room mới chỉ cần định nghĩa `findPlayer()`. Thứ tự chạy:

1. `findPlayer()` — player không còn trong room: `result = Response.error(NOT_FOUND)`.
2. Nếu command khai `validateSchema` (Zod): parse payload vào `this.body`; sai thì `result = Response.error(INVALID_INPUT)`
   (kèm `invalidError` nếu khai, mặc định là `error.issues`). Luôn trả lời, không còn trường hợp im lặng.
3. `validate()` của command: cổng đồng bộ cho phần còn lại (trạng thái, quyền, tìm đối tượng). Từ chối thì tự gán
   `this.result = Response.error(...)` rồi `return false` (khi `false`, `execute()` không chạy và dispatcher không gửi gì).
4. `guards`: `protected readonly guards: readonly CommandGuard<this>[]` chạy tuần tự trước `execute()`; guard trả
   `Result` thất bại (hoặc ném `serviceError`) để từ chối — dùng cho rate limit (`assertRateLimit`), yêu cầu trạng thái,
   quyền chủ party...
5. `execute()`: hành động chính, mutation, các kiểm tra cần `await`; gán `this.result`. Method private có thể
   chia nhỏ hành động trong cùng command.

Command túi đồ (room `global`, `global/modules/inventory`) dùng chung abstract `InventoryGlobalCommand` lo validate, chạy trên bản
làm việc của PlayerData, lưu DB, đẩy sang world và gửi `inventory`/`attributes`; từng command con chỉ viết thao tác của mình trong `run()`.

## Đăng ký message

Command khai `static readonly message = <Room>ClientMessage.KEY`. File `.room.ts` gọi
`await loadRoomMessages(new URL(".", import.meta.url))` ở module scope để quét đệ quy thư mục room của mình rồi gán kết
quả vào `messages`; Colyseus bind handler vào từng instance. Không viết bảng `messages` thủ công. Command lifecycle,
timer và abstract command không có `static message`. Chi tiết: [đăng ký message](room-messages.md).

## Service đặt ở đâu

Service chứa xử lý dùng lại hoặc capability được nơi khác gọi: đồng bộ state, thông báo, phiên thoại, cấp item,
tra cứu/trừ tiền/cập nhật trang bị, lưu DB, truy vấn RPC. Không tạo method service chỉ để bọc handler của một command.

## Với `@colyseus/command` đang dùng

- Dispatch tự gắn `room`, `state`, `clock`; không gọi `execute()` trực tiếp.
- `execute()` trả `void`, một command khác hoặc mảng command (có thể qua promise); dispatcher chạy tuần tự các command
  con. **Không trả DTO nghiệp vụ từ `execute()`** — nó bị hiểu là command con. Dữ liệu trả cho client đi qua `this.result`.
- `dispatch()` không trả kết quả nghiệp vụ và không tuần tự hoá các lời gọi top-level riêng rẽ. Kiểm tra lại giả định
  có thể đổi sau `await`.
- RPC giữa room (`matchMaker.remoteRoomCall`) cũng chạy trong command: command RPC khai field `result`, gán trong
  `execute()`; nơi gọi dùng `callRoom(roomId, XCommand, payload, { timeoutMs? })` (mặc định 3 giây); room đích liệt kê command được phép
  trong `createRpcRunner(this, [...])` (đọc kết quả bằng `dispatchForResult`). Command RPC không có `static message`
  nên `loadRoomMessages()` bỏ qua.

## Thư mục trong một module room

Chia theo **mục đích** của file, không theo từ khoá `type` / `interface` của TypeScript (`types/` vẫn chứa `interface`).

| Thư mục       | Chứa gì                                                                                                         | Ví dụ                            |
| ------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `commands/`   | Một command một file `*.<feature>.<room>.command.ts`                                                            | `party-invite.global.command.ts` |
| `services/`   | Class xử lý dùng lại, kèm singleton (`partyGlobalService`); gọi room khác, gửi message                          | `party.global.service.ts`        |
| `schemas/`    | Class Colyseus Schema: state (`*.state.ts`, kể cả state chỉ ở server không `@type` như `PartyState`)            | `party.global.state.ts`          |
| `interfaces/` | **DTO gửi cho client**: interface tên kết thúc `Message`, file `*.message.ts` (generator SDK tự tìm để sinh C#) | `party.global.message.ts`        |
| `enums/`      | Mọi enum của module, kể cả enum gửi client (`PartyNotice`) và mã lỗi                                            | `party-error-code.enum.ts`       |
| `types/`      | Kiểu **chỉ dùng trong server**: payload RPC giữa room, cấu trúc nội bộ, options                                 | `party-rpc.type.ts`              |
| `validators/` | Zod schema kiểm tra payload client gửi lên                                                                      | `member.party.validator.ts`      |

Chọn nhanh: gửi xuống client thì `interfaces/` (enum thì `enums/`); là enum thì `enums/`; là Schema / state thì `schemas/`;
còn lại là kiểu nội bộ server thì `types/`. State Schema chỉ đổi dữ liệu và trả kết quả, việc gửi message hay gọi room khác
nằm ở `services/` hoặc command. Hai file enum message của room (`global/types/global-message.type.ts`,
`world/types/world-message.type.ts`) ở đúng đường dẫn đó vì generator đọc cứng.

## Thêm module mới vào room

Ví dụ thêm tính năng `friend` vào `global` (với `world` làm tương tự trong `world/modules/<feature>`):

1. **Thư mục**: `src/rooms/global/modules/friend/{commands,services,validators,types,interfaces,enums}` (`interfaces/friend.global.message.ts` chứa
   DTO `...Message` gửi client, `enums/` chứa enum; `schemas/` chỉ dành cho Colyseus Schema, world dùng). Một command một file `*.friend.global.command.ts`; service `*.global.service.ts`.
2. **Enum message** (`global/types/global-message.type.ts`): thêm member vào `GlobalClientMessage` (request) kèm JSDoc —
   JSDoc thành `<summary>` của hàm C#. Thêm vào `GlobalMessage` chỉ khi server cần **đẩy** sự kiện xuống (push), và
   khai DTO `...Message` (interface có tên kết thúc `Message`) cho `data` trong `modules/friend/interfaces/friend.global.message.ts`.
3. **Validator** Zod của payload (`validators/*.validator.ts`), export có tên: SDK đặt tên class C# theo tên export.
4. **Mã lỗi**: thêm vào enum domain (`enums/friend-error-code.enum.ts`, value = key, có JSDoc từng member) và gọi
   `registerErrorCodes(FriendErrorCode)`; export qua `global.shared.ts` nếu room khác cần.
5. **Command**: kế thừa `PlayerGlobalCommand<Payload, typeof Schema>`, khai `static readonly message` và
   `validateSchema`, xử lý trong `execute()` và gán `this.result`:

    ```ts
    @SdkMessage({
        response: "FriendListMessage", // DTO của data; bỏ trống nếu response không có data
        errors: [FriendErrorCode.FRIEND_LIMIT_REACHED], // mã nghiệp vụ (INVALID_INPUT được thêm tự động)
        replies: [GlobalMessage.FRIEND_UPDATED], // push đẩy thêm như hiệu ứng phụ (nếu có)
        note: "Người nhận được push friendUpdated.",
    })
    export class FriendAddGlobalCommand extends PlayerGlobalCommand<
        Payload,
        typeof FriendAddSchema
    > {
        static readonly message = GlobalClientMessage.FRIEND_ADD;
        protected override readonly validateSchema = FriendAddSchema;

        async execute() {
            const error = await friendGlobalService.add(this.player, this.body.name);
            this.result = error
                ? Response.error(error)
                : Response.success<FriendListMessage>(friendGlobalService.list(this.player));
        }
    }
    ```

6. **Không cần sửa `global.room.ts`**: `loadRoomMessages` tự tìm command mới (restart process; `yarn dev` tự restart).
   Chỉ khi module cần RPC từ room khác mới thêm command RPC vào `createRpcRunner`.
7. **State/dữ liệu người chơi** mới trong DB: thêm bảng ở `src/modules/<module>` (entity + repository + service) và cập
   nhật `AccountDeletionService.purgeUserData` nếu là dữ liệu người chơi.
8. `yarn typecheck && yarn lint`, rồi `yarn unity:network` để sinh lại `GlobalRoomClient` (hàm
   `await FriendAdd(...)` trả `Result<FriendListMessage>`, và `OnFriendUpdated(...)` cho push), cuối cùng mở rộng
   `yarn smoke` nếu luồng quan trọng.

Quy tắc ranh giới: world không import implementation của global (chỉ `global.shared.ts` và command RPC), global chỉ
import `world.shared.ts` và command RPC của world. Quy trình đi qua nhiều room: command của room khởi xướng gọi
`callRoom`, hoặc đặt thành module riêng của `global` (như `dungeon-launch`).
