# Các room realtime

Hướng dẫn tiếng Việt: [Tương tác giữa các room, cách sử dụng và mở rộng](../../docs/room-interactions.md).

Message từ client được [tự quét và đăng ký từ command](../../docs/room-messages.md)
qua `static readonly message`; room không cần bảng `messages` thủ công.

- `index.room.ts` kết nối base room trong core với xác thực tài khoản và chính sách
  reconnect của `modules/auth`. World và party cùng kế thừa adapter này; core không
  phụ thuộc modules.
- `world/` chứa command vòng đời, điều phối tick, state và các module tính năng của
  world. Xem [world/README.md](world/README.md).
- `party/` chứa party room, vòng đời và các module tính năng của party.
- `integrations/` chứa RPC remote có kiểu và transport gọi room.
  Logic party phía world nằm trong command và service của `world/modules/players`.
- `coordinators/` điều phối vào dungeon bằng các snapshot của party và world. Instance
  dungeon dùng lại world room với bộ lọc matchmaking khác.

Tìm/tạo party nằm trong `playerPartyWorldService.ensureParty()` phía world. Service
dùng matchmaking để tạo room khi cần, rồi gọi `partyRoomRemote` để gắn thành viên.

Hạ tầng room dùng chung nằm trong `src/core/rooms`; service nghiệp vụ/dữ liệu dùng
chung nằm trong `src/modules`. Tính năng riêng của world nằm trong
`world/modules/<feature>`, gồm cả Colyseus `schemas/` của tính năng đó.

Logic và DTO party nằm trong `src/rooms/party`, không có module DB party.
World chỉ import phần công khai qua `party.shared.ts` và `party.remote.ts`;
không import trực tiếp room, state hoặc service implementation của party.
World cũng có `world.shared.ts` cho enum/DTO và hàm dựng cấu hình skill dùng chung;
message và options của world nằm trong `world/types`.
Test kiến trúc kiểm tra ranh giới này. Schema `party_config` và enum chế độ loot
thuộc `modules/master-data` vì cấu hình đó được lưu trong master data.

Gọi room khác bằng `partyRoomRemote(roomId).method(...)` hoặc
`worldRoomRemote(roomId).method(...)`. Mỗi file `<room>.remote.ts` import type từ
class room tương ứng để suy ra chữ ký method. Mỗi RPC là một hàm tường minh trong
remote (kèm fallback), nên click vào tên method nhảy tới method trên room; danh sách
`PartyRpc`/`WorldRpc` cũng giới hạn các method được gọi từ room khác.

Lời gọi giới hạn chờ 3 giây và trả fallback khi lỗi; timeout không hủy công việc
ở room đích. Membership mang `eventId`, party nguồn và revision. Báo cáo world mang
world nguồn và revision để bỏ cập nhật cũ/lặp. Giao tiếp dùng transport của Colyseus;
khi chạy nhiều process cần cấu hình Redis dùng chung.
