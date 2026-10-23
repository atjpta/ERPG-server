# Các room realtime

Hướng dẫn tiếng Việt: [Tương tác giữa các room, cách sử dụng và mở rộng](../../docs/room-interactions.md).

Message từ client được [tự quét và đăng ký từ command](../../docs/room-messages.md)
qua `static readonly message`; room không cần bảng `messages` thủ công.

- `index.room.ts` kết nối base room trong core với xác thực tài khoản và chính sách
  reconnect của `modules/auth`. World và global cùng kế thừa adapter này (bắt buộc
  `options.serverId` khớp token); core không phụ thuộc modules.
- `world/` chứa command vòng đời, điều phối tick, state và các module tính năng của
  world. Xem [world/README.md](world/README.md).
- `global/` là room duy nhất của mỗi game server (`filterBy(["serverId"])`, state `GlobalState` không sync cho client): chat, party
  (logic trong room, không còn room riêng mỗi party), presence (ai đang ở world room nào) và điều phối vào
  dungeon. Xem [global/README.md](global/README.md). Instance dungeon dùng lại world room với bộ lọc
  matchmaking khác. Mỗi player giữ 2 kết nối: world + global.
- `dungeon` là lần đăng ký thứ hai của class `WorldRoom` (`filterBy(["serverId","instanceId"])`), cố ý không phải
  room thứ ba: cùng state, cùng bộ message; chỉ khác cách matchmaking ghép instance. Hai tên đăng ký, hai class room.
- Request/Response: client gọi `room.Request<T>(message, payload)` và nhận envelope `Result` (command gán
  `this.result`); chỉ thông báo server chủ động (`GlobalMessage`, `WorldMessage`) mới đi qua `client.send*`.
  Payload sai → `INVALID_INPUT`, message không có handler → lỗi giao thức `no_handler` (Unity: `RequestError`).
- Mỗi thư mục room có đúng một cặp enum: `<Room>ClientMessage` (client → server) và `<Room>Message` (push) trong
  `<room>/types/<room>-message.type.ts`; SDK Unity sinh `WorldRoomClient` / `GlobalRoomClient` từ cặp enum này.

Thêm tính năng mới vào một room: [Thêm module mới vào room](../../docs/room-command-pattern.md#thêm-module-mới-vào-room).

World gọi global room bằng `callRoom(serverId, XGlobalCommand, payload)`: `roomId` của global room chính là `serverId`, room được dựng sẵn lúc khởi động (`InitRoom`).

Hạ tầng room dùng chung nằm trong `src/core/rooms`; service nghiệp vụ/dữ liệu dùng
chung nằm trong `src/modules`. Tính năng riêng của world nằm trong
`world/modules/<feature>`, gồm cả Colyseus `schemas/` của tính năng đó.

Logic và DTO party nằm trong `src/rooms/global/modules/party`, không có module DB party.
World chỉ import phần công khai qua `global.shared.ts` (DTO, enum, các command RPC của global);
không import trực tiếp room, state hoặc service implementation của global. Ngược lại global chỉ
import `world.shared.ts` và các command RPC của world.
World cũng có `world.shared.ts` cho enum/DTO và hàm dựng cấu hình skill dùng chung;
message và options của world nằm trong `world/types`.
Schema `party_config` và enum chế độ loot
thuộc `modules/master-data` vì cấu hình đó được lưu trong master data.

Gọi room khác bằng `callRoom(roomId, XCommand, payload)`: kiểu payload và kết quả suy ra từ chính class command,
click vào tên class nhảy thẳng tới logic. Room đích liệt kê command được phép gọi trong
`createRpcRunner(this, [...])`.

Lời gọi giới hạn chờ 3 giây và trả fallback khi lỗi; timeout không hủy công việc
ở room đích. Membership mang `eventId`, party nguồn và revision. Báo cáo world mang
world nguồn và revision để bỏ cập nhật cũ/lặp. Giao tiếp dùng transport của Colyseus;
khi chạy nhiều process cần cấu hình Redis dùng chung.
