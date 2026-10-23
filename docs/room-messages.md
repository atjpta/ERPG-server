# Tự đăng ký message của room

File `.room.ts` gọi `loadRoomMessages()` khi module được nạp. Hàm quét đệ quy các
file `*.command.ts` khi phát triển hoặc `*.command.js` sau build, trong đúng thư mục
room được truyền vào. Không cần viết bảng `messages` hoặc import từng message command
trong file room.

Hàm trả về object handler, tương tự cách `loadControllers()` trả về object endpoint
cho `index.ts`. File room gán object đó vào thuộc tính `messages`; Colyseus thực hiện
đăng ký và bind handler vào đúng instance room.

```ts
import { loadRoomMessages } from "@/core/utils/load-room-messages.util.js";

const messages = await loadRoomMessages(new URL(".", import.meta.url));

export class GlobalRoom extends AuthenticatedPlayerRoom {
    messages = messages;
    // dispatcher, serverId, sessionOf... đến từ BaseGameRoom; chỉ viết phần riêng của room.
}
```

Hạ tầng quét nằm trong `src/core/utils/load-room-messages.util.ts`, cạnh loader của
controller, dùng chung cho `world` và `global`. Hai tên đăng ký `world` và `dungeon` cùng dùng class `WorldRoom`
nên có cùng bộ message của world.

## Handler trả `Result`

Mỗi handler nhận `(client, payload)`, tạo command mới, `await dispatcher.dispatch(...)` và **trả `command.result`**
(`Response.success()` nếu command không gán). Lỗi ném ra khỏi dispatch được `Response.fromError` đổi thành `Result` thất bại. Vì vậy:

- Client gọi bằng Request (`room.Request<T>` / `room.request`) nhận đúng envelope `Result` làm response.
- Client vẫn có thể `Send` (fire-and-forget): Colyseus bỏ qua giá trị trả về, mọi thứ khác như cũ.
- Handler `"*"` của Colyseus không trả lời được request nên không dùng.
- Message không có command: Colyseus trả `no_handler` (lỗi giao thức, không phải `Result`).

## Thêm message mới

1. Thêm key vào enum message client → server của room: `WorldClientMessage` (`world/types/world-message.type.ts`) hoặc
   `GlobalClientMessage` (`global/types/global-message.type.ts`), kèm JSDoc. Mỗi room có đúng một cặp enum:
   `<Room>ClientMessage` (request) và `<Room>Message` (push server → client).
2. Tạo command trong module tương ứng, mỗi class một file `*.command.ts`.
3. Khai báo `static readonly message` bằng key enum ngay trong class.
4. Validate payload (`validateSchema`), kiểm tra quyền và nghiệp vụ trong command, gán `this.result`.
5. Gắn `@SdkMessage({ response, errors, replies, note })` để SDK Unity có kiểu response và mã lỗi
   ([client SDK](client-sdk.md)).

Ví dụ command hiện có:

```ts
@SdkMessage({ response: "PartyStateMessage", errors: [PartyErrorCode.PARTY_FULL] })
export class PartyAcceptInviteGlobalCommand extends PlayerGlobalCommand<
    PartyCommandPayload,
    typeof PartyInviteReplySchema
> {
    static readonly message = GlobalClientMessage.PARTY_ACCEPT_INVITE;
    protected override readonly validateSchema = PartyInviteReplySchema;

    execute({ client }: PartyCommandPayload) {
        const party = this.room.parties.get(this.body.partyId);
        if (!party) {
            this.result = Response.error(PartyErrorCode.PARTY_NO_INVITE);
            return;
        }
        const error = this.room.parties.join(party, client.auth.playerId, this.clock.currentTime);
        this.result = error
            ? Response.error(error)
            : Response.success<PartyStateMessage>(party.state.toMessage(party.id));
    }
}
```

Không phải sửa `global.room.ts` để thêm handler. Nếu enum/DTO thay đổi, chạy `yarn unity:network`.

## Luồng xử lý

```text
Client Request(key, payload)
  → Colyseus ROOM_REQUEST (dùng chung handler với onMessage(key))
  → tạo instance command mới
  → dispatcher.dispatch(command, { client, payload })
  → findPlayer → validateSchema → validate() → guards → execute()
  → handler trả command.result → frame OK(Result) / client nhận Result
```

Payload luôn được chuyển dưới dạng `{ client, payload }`; command không dùng payload
có thể chỉ lấy `{ client }`. Dispatcher vẫn gắn `room`, `state`, `clock` và xử lý
command con. Thời gian chờ mặc định của request phía client là 10 giây (`Room.defaultRequestTimeout`).

## Quy tắc đăng ký

- Chỉ class kế thừa `Command` và tự khai báo static `message` mới được đăng ký.
- Key là string không rỗng hoặc number hữu hạn; không dùng wildcard `"*"`.
- Command lifecycle, timer và abstract command không khai báo `message` nên không
  trở thành endpoint cho client. Không đặt key ở base command để các lớp con kế thừa.
- Key trùng trong cùng room làm đăng ký thất bại trước khi gắn handler nào.
  Số `7` và chuỗi `"7"` được coi là trùng theo cách Colyseus chuẩn hóa key.
- `world` và `global` được quét riêng theo thư mục room, không đăng ký nhầm message của nhau.
- Kết quả quét được cache theo thư mục trong process. Các handler dùng `this.dispatcher`,
  được Colyseus bind vào từng instance room; mỗi lượt nhận message tạo command mới.
  Không dùng arrow function phụ thuộc `this` trong object handler trả về. Thêm/sửa file cần restart
  process; chế độ `yarn dev` dùng watch để restart khi source thay đổi.
- Hàm này đăng ký message từ client, không đăng ký RPC giữa room. RPC vẫn dùng
  `callRoom` và command RPC trong danh sách `createRpcRunner` của room.

Xem thêm [quy tắc command](room-command-pattern.md) và
[tương tác giữa các room](room-interactions.md).
