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

export class WorldRoom extends AuthenticatedPlayerRoom {
    messages = messages;
    dispatcher = new Dispatcher(this);
    // Các field và lifecycle khác giữ như trong world.room.ts.
}
```

Hạ tầng quét nằm trong `src/core/utils/load-room-messages.util.ts`, cạnh loader của
controller, dùng chung cho
world và party. Các instance dungeon dùng `WorldRoom` nên tự có cùng bộ message của world.

## Thêm message mới

1. Thêm key vào enum message client → server của room: `WorldClientMessage` hoặc
   `PartyClientMessage`. Enum vẫn là danh sách dùng chung với client Unity.
2. Tạo command trong module tương ứng, mỗi class một file `*.command.ts`.
3. Khai báo `static readonly message` bằng key enum ngay trong class.
4. Xử lý validate payload, kiểm tra quyền và nghiệp vụ trong command như trước.

Ví dụ command hiện có:

```ts
export class PartyCreateWorldCommand extends Command<WorldRoom, PartyPayload> {
    static readonly message = WorldClientMessage.PARTY_CREATE;

    async execute({ client }: PartyPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player || player.hp <= 0) return;
        await playerPartyWorldService.ensureParty(this.room, player);
    }
}
```

Không phải sửa `world.room.ts` để thêm handler. Nếu enum/DTO thay đổi, chạy quy trình
sinh schema/message cho Unity bằng `yarn schema:generate` như trước.

## Luồng xử lý

```text
Client gửi key + payload
  → Colyseus onMessage(key)
  → tạo instance command mới
  → dispatcher.dispatch(command, { client, payload })
  → execute() hoặc execute() của base command → run()
```

Payload luôn được chuyển dưới dạng `{ client, payload }`; command không dùng payload
có thể chỉ lấy `{ client }`. Dispatcher vẫn gắn `room`, `state`, `clock` và xử lý
command con. Lỗi bất đồng bộ được trả về handler của Colyseus, không bị nuốt bởi hàm quét.

## Quy tắc đăng ký

- Chỉ class kế thừa `Command` và tự khai báo static `message` mới được đăng ký.
- Key là string không rỗng hoặc number hữu hạn; không dùng wildcard `"*"`.
- Command lifecycle, timer và abstract command không khai báo `message` nên không
  trở thành endpoint cho client. Không đặt key ở base command để các lớp con kế thừa.
- Key trùng trong cùng room làm đăng ký thất bại trước khi gắn handler nào.
  Số `7` và chuỗi `"7"` được coi là trùng theo cách Colyseus chuẩn hóa key.
- World và party được quét riêng, không đăng ký nhầm message của nhau.
- Kết quả quét được cache theo thư mục trong process. Các handler dùng `this.dispatcher`,
  được Colyseus bind vào từng instance room; mỗi lượt nhận message tạo command mới.
  Không dùng arrow function phụ thuộc `this` trong object handler trả về. Thêm/sửa file cần restart
  process; chế độ `yarn dev` dùng watch để restart khi source thay đổi.
- Hàm này đăng ký message từ client, không đăng ký RPC giữa room. RPC vẫn dùng
  `worldRoomRemote`/`partyRoomRemote` và method công khai trên room.

Xem thêm [quy tắc command](room-command-pattern.md) và
[tương tác giữa các room](room-interactions.md).
