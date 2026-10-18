# Tương tác giữa các room

## 1. Nguyên tắc và trách nhiệm

Mỗi room sở hữu state và quy tắc của mình. Room khác gửi yêu cầu qua RPC remote,
không lấy instance của room đích để đọc hoặc sửa state trực tiếp.

| Thành phần              | Trách nhiệm                                                                      |
| ----------------------- | -------------------------------------------------------------------------------- |
| `WorldRoom`             | Người chơi trong map, chiến đấu, áp dụng phần thưởng, lưu dữ liệu và chuyển map  |
| `PartyRoom`             | Thành viên, trưởng nhóm, chế độ loot và phân bổ phần thưởng                      |
| Room `dungeon`          | Instance dungeon, hiện dùng lại class `WorldRoom`; định tuyến theo `instanceId`  |
| Command / service world | Command xử lý hành động và gọi RPC; service giữ xử lý dùng lại và capability RPC |
| Coordinator             | Điều phối quy trình cần nhiều room, ví dụ đưa cả party vào dungeon               |
| Directory               | Tra cứu `playerId` đang thuộc party nào, đang ở world room nào                   |

Toàn bộ logic runtime và DTO party nằm trong `src/rooms/party`. World chỉ dùng
entrypoint công khai `party.shared.ts` (DTO, enum, hàm thuần và directory) hoặc
các **command RPC** của party (để gọi bằng `callRoom`), không import service, schema hay implementation khác bên trong party.
Kiểu payload và kết quả suy ra từ chính class command, không cần interface Contract.

Riêng `party_config` được lưu trong master data, nên schema Zod và enum loot-mode
nằm trong `src/modules/master-data`. Module master-data không phụ thuộc room.

Directory là thông tin định tuyến có thời hạn, có thể cũ khi người chơi đổi map.
Room sở hữu dữ liệu vẫn phải kiểm tra người chơi và trạng thái thực tế khi nhận RPC.

## 2. Các file cần biết

World có entrypoint tương ứng là `src/rooms/world/world.shared.ts`: xuất enum/DTO
message, `WorldRoomOptions` và `buildClientSkillConfig`. Phần export cấu hình client
đang dùng hàm builder qua entrypoint này. Message được khai báo trong
`world/types/world-message.type.ts`, options trong `world/types/world-room.type.ts`.
Không export `WorldRoom`, state sống hoặc service runtime qua file shared.

Các đường dẫn dưới đây tính từ thư mục gốc project.

| File                                                                     | Vai trò                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `src/rooms/party/types/party-room.type.ts`                               | DTO dùng chung cho yêu cầu và kết quả RPC                            |
| `src/rooms/<room>/commands/*.command.ts` (command RPC)                   | Mỗi RPC là một command: payload vào, `Result` ra                     |
| `src/rooms/party/party.shared.ts`                                        | Entry point DTO, enum, hàm thuần và directory cho room khác          |
| `src/core/rooms/room.integration.ts`                                     | `callRoom`, `createRpcRunner`, gọi Colyseus, timeout và log          |
| `src/rooms/world/modules/players/services/player-party.world.service.ts` | Capability RPC, tìm player, tạo/áp dụng snapshot và xử lý dùng chung |
| `src/rooms/coordinators/dungeon-party.coordinator.ts`                    | Kiểm tra các thành viên và điều phối vào dungeon                     |
| `src/rooms/party/services/party-directory.service.ts`                    | Tra cứu vị trí world, party và thông tin nhóm dự kiến vào dungeon    |

## 3. Một lời gọi đi như thế nào?

Command gọi trực tiếp `callRoom(roomId, XCommand, payload)` khi xử lý một hành động.
Không có lớp `world-party.integration.ts` trung gian. Phía world phân chia như sau:

| Xử lý                                                         | Nơi sở hữu                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| Gắn world với party khi vào map                               | `PartyAttachWorldCommand`                                      |
| Tách world hoặc rời party khi ra khỏi map                     | `PartyDetachWorldCommand`                                      |
| Làm mới vị trí người chơi trong directory                     | `PartyHeartbeatWorldCommand`                                   |
| Báo HP/level/map sang party                                   | `PartyReportWorldCommand`                                      |
| Xin gia nhập, từ chối lời mời                                 | `PartyRequestJoinWorldCommand`, `PartyDeclineWorldCommand`     |
| Tạo/lấy party để tạo nhóm hoặc vào dungeon                    | `playerPartyWorldService.ensureParty()` vì được nhiều nơi dùng |
| Tìm player, tạo/áp dụng snapshot, nhận RPC membership/lời mời | `playerPartyWorldService`                                      |

Các command trên nằm trong `world/modules/players/commands`, service nằm trong
`world/modules/players/services`. Lifecycle và timer của world dispatch command
tương ứng. Coordinator giữ quy trình phối hợp party và world như vào dungeon.

Tìm/tạo party thuộc `playerPartyWorldService.ensureParty()` phía world vì luồng này
chỉ gọi `callRoom` tới party. Nếu đã có party, service xác nhận thành viên qua RPC.
Nếu cần tạo mới, service gọi matchmaking vì chưa có room đích để gọi remote.
Các yêu cầu tạo đồng thời cho cùng player dùng chung Promise trong một process.
`isPartyRoomListed()` chỉ kiểm tra listing matchmaking, không bảo đảm room còn phản hồi RPC.

```mermaid
sequenceDiagram
    participant P as PartyRoom
    participant C as callRoom
    participant T as requestRoom / Colyseus
    participant W as WorldRoom đích
    P->>C: PartyDeliverInviteWorldCommand, payload
    C->>T: roomId, "runRpc", tên command, payload
    T->>W: runRpc chạy command trong danh sách
    W-->>T: DTO người chơi hoặc null
    T-->>C: kết quả hoặc fallback khi lỗi
    C-->>P: Promise kết quả
```

Ví dụ đang dùng trong lệnh mời party:

```ts
import { callRoom } from "@/core/rooms/room.integration.js";
import { PartyDeliverInviteWorldCommand } from "@/rooms/world/modules/players/commands/party-deliver-invite.world.command.js";

const delivered = await callRoom(worldRoomId, PartyDeliverInviteWorldCommand, {
    playerId: target.id,
    message: {
        partyRoomId: this.room.roomId,
        fromName: this.room.state.nameOf(leaderId),
        expiresInSec: 30,
    },
});

if (!delivered.success) {
    // `delivered.code`: PLAYER_OFFLINE (đã rời room) hoặc ROOM_UNAVAILABLE (RPC lỗi / timeout).
    return;
}
const snapshot = delivered.data;
```

`target`, `leaderId` trong ví dụ là dữ liệu của command đang xử lý.
`worldRoomId` là ID instance room đích, không phải tên đăng ký `"world"`.

`callRoom` gọi `matchMaker.remoteRoomCall()` tới method `runRpc` của room đích kèm tên command. Code nghiệp vụ không
viết chuỗi tên method; TypeScript suy kiểu payload và kết quả từ class command, và Ctrl+click vào tên class nhảy
thẳng tới logic. Mọi lời gọi đều trả `Promise<Result>`, kể cả khi command chạy đồng bộ.

Remote không tạo kết nối WebSocket mới và không yêu cầu client Unity join room đích.
Đây là giao tiếp nội bộ giữa các room trên server.

## 4. Cách sử dụng

### World gọi party

```ts
import { callRoom } from "@/core/rooms/room.integration.js";
import { AttachWorldPartyCommand } from "@/rooms/party/commands/attach-world.party.command.js";

const attached = await callRoom(partyRoomId, AttachWorldPartyCommand, {
    playerId: player.id,
    worldRoomId: room.roomId,
    info: memberInfo,
});

if (attached.success) {
    player.partyRoomId = attached.data.partyRoomId;
    player.partyLootMode = attached.data.lootMode;
}
```

`memberInfo` là DTO `PartyMemberInfo`, được tạo từ state của world. Không truyền
`PlayerWorldState`, `Room`, `Client`, `MapSchema`, function hoặc instance service qua RPC.
Dùng object/array và các giá trị có thể biểu diễn bằng JSON; khi cần danh sách từ
`Map`, chuyển thành array trước. Không dựa vào prototype hoặc tham chiếu object được giữ nguyên.

### Quy trình cần nhiều room

Đặt việc điều phối vào coordinator thay vì để world và party gọi vòng qua lại.
Quy trình dungeon hiện tại:

1. Party trả kế hoạch và danh sách thành viên qua `prepareDungeon()`.
2. Coordinator gọi `partyCheckDungeon()` trên world của từng thành viên.
3. Nếu các kiểm tra đều đạt, tạo một `instanceId` chung và ghi danh sách dự kiến.
4. Gọi `partyEnterDungeon()` cho các thành viên.
5. Nếu có lỗi, báo lại party bằng `notifyDungeonDenied()`.

Đây chưa phải giao dịch chuyển room nguyên tử: một người có thể đã chuyển trong khi
người khác lỗi. Nếu mở rộng quy trình này, cần bổ sung mã thao tác và đối soát trạng thái;
không mặc định rằng timeout đồng nghĩa với chưa chuyển room.

## 5. Thêm một tương tác mới

Ví dụ muốn world đọc thông tin tổng quan của party. Đây là ví dụ mở rộng,
`getSummary()` chưa tồn tại trong code hiện tại.

### Bước 1: Khai báo DTO dùng chung

Thêm vào `src/rooms/party/types/party-room.type.ts`:

```ts
export interface PartySummary {
    partyRoomId: string;
    leaderPlayerId: string;
    memberCount: number;
}
```

Module chỉ mô tả dữ liệu trao đổi (`data` của `Result`), không import implementation của room.
Thao tác có thể bị từ chối vì nghiệp vụ thì trả `fail(<Domain>ErrorCode.X)`; thêm mã mới vào enum của domain nếu cần
(xem [định dạng trả về chung](response-format.md)).

### Bước 2: Cài đặt ở room sở hữu dữ liệu

Mỗi RPC là một command nhận **một object payload** và ghi `Result` vào `result`
(`src/rooms/party/commands/*.party.command.ts`). Ví dụ thêm `getSummary` cho `PartyRoom`, với `PartySummary`
import từ file DTO:

```ts
// commands/get-summary.party.command.ts
export class GetSummaryPartyCommand extends Command<PartyRoom, Record<string, never>> {
    result: Result<PartySummary> = fail(CommonCode.ROOM_UNAVAILABLE);

    execute() {
        const { room } = this;
        this.result = room.disbanded
            ? fail(PartyErrorCode.PARTY_NOT_MEMBER)
            : ok({
                  partyRoomId: room.roomId,
                  leaderPlayerId: room.state.leaderPlayerId,
                  memberCount: room.state.size,
              });
    }
}
```

Command không cần trả dữ liệu thì gán `result = ok()`.

### Bước 3: Cho phép gọi từ room khác

Thêm command vào danh sách của room (`party.room.ts`):

```ts
readonly runRpc = createRpcRunner(this, [
    // ...
    GetSummaryPartyCommand,
]);
```

Chỉ command trong danh sách mới chạy được; tên lạ trả `fail(CommonCode.NOT_FOUND)`. Tên class là một phần giao
thức giữa hai room, nên đổi tên command RPC thì cập nhật cả hai phía (typecheck báo ở chỗ gọi).

### Bước 4: Gọi từ nơi cần dùng

```ts
const summary = await callRoom(partyRoomId, GetSummaryPartyCommand, {});
if (!summary.success) return; // summary.code: PARTY_NOT_MEMBER hoặc ROOM_UNAVAILABLE
// Dùng summary.data.memberCount, summary.data.leaderPlayerId...
```

`code` phân biệt “party không tồn tại / không còn” (lỗi nghiệp vụ) với “không gọi được room”
(`ROOM_UNAVAILABLE`), nên không cần giá trị fallback riêng.

### Bước 5: Kiểm tra

Kiểm tra luồng thành công, room không còn/player đã đổi room, từ chối nghiệp vụ,
timeout và xử lý lặp nếu có mutation. Kiểm tra type để bắt tên method hoặc tham số sai.
Chạy `yarn typecheck` và `yarn lint`.

## 6. Command và service đặt ở đâu?

- Hành động từ client hoặc lifecycle của room được xử lý bởi command, mỗi class một file.
- Logic chỉ phục vụ một hành động nằm trong command đó; không tạo service để bọc nguyên handler.
- Xử lý tái sử dụng hoặc capability được nơi khác gọi, như truy vấn RPC trả snapshot,
  có thể nằm trong service. Method công khai trên room là điểm vào của RPC, và nên chỉ dispatch command.
- Method RPC trên room cũng chạy trong command. Command cần trả dữ liệu thì khai báo field
  `result`, gán trong `execute()` (vẫn trả `void`), và room đọc lại bằng
  `createRpcRunner(this, [XCommand])`. Không trả DTO từ `Command.execute()`: dispatcher coi giá trị
  trả về là command con.

Chi tiết: [Quy tắc command](room-command-pattern.md).

## 7. Timeout, lỗi và xử lý lặp

`requestRoom()` giới hạn chờ 3 giây, đồng thời truyền cùng giới hạn cho Colyseus IPC.
Khi có lỗi (timeout, room không còn), hàm ghi log và `callRoom` trả
`fail(CommonCode.ROOM_UNAVAILABLE)`, nên bên gọi luôn phân biệt được với lỗi nghiệp vụ qua `code`.

`partySetPlayerParty()` thành công trả `ok()` (không có `data`). Thành công chỉ nghĩa là room đích đã nhận và
xử lý lời gọi; việc bỏ qua bản cũ / trùng vẫn trả `ok()`. Khi cần xác nhận kết quả thật, đặt nó vào `data`
hoặc dùng cơ chế đồng bộ lại trạng thái.

Timeout dừng chờ ở bên gọi, không hủy công việc ở room đích. Không tự động retry mọi
mutation. Với cộng thưởng, trừ tiền, tạo instance hoặc chuyển map, dùng `eventId`/
`operationId` và lưu kết quả đã xử lý để cùng mã thao tác không gây tác động lần hai.
Cần cân nhắc thời hạn lưu kết quả và trường hợp room/process khởi động lại.

Hiện tại phân bổ loot có chống lặp bằng `eventId` với cache giới hạn trong bộ nhớ của
party room. Membership dùng revision theo nguồn party; báo cáo world dùng revision
theo nguồn world để bỏ cập nhật cũ. Đây không phải bảo đảm mọi RPC đều chống lặp
hoặc mọi lời gọi top-level đều chạy tuần tự; kiểm tra lại điều kiện sau các `await`
khi trạng thái có thể thay đổi.

## 8. Thêm loại room mới, ví dụ chat

Khi cần vòng đời và state riêng, tạo room mới cùng DTO và remote riêng:

1. Khai báo DTO trong `src/rooms/chat/types/` nếu chat là tính năng runtime của room.
2. Tạo `ChatRoom` cùng cấu trúc commands/modules/schemas và các method RPC công khai.
3. Đăng ký room tại `src/rooms/index.room.ts` và cung cấp class từ entrypoint.
4. Khai báo command RPC của chat và `readonly runRpc = createRpcRunner(this, [...])`; nơi gọi dùng `callRoom(chatRoomId, XCommand, payload)`. Nếu cần chia sẻ DTO/hàm thuần, xuất qua `chat.shared.ts`.
5. Xác định cách tra cứu instance chat đích, ví dụ theo server/shard; không dùng tên
   đăng ký room thay cho `roomId` khi gọi RPC.
6. Đặt quy trình cần nhiều room vào coordinator và bổ sung test ranh giới import.

Các bước trên là hướng mở rộng, chat chưa được cài đặt. Có thể dùng kênh logic trong
chat room cho local/party/private; room đích kiểm tra người nhận và quyền gửi từ
trạng thái server. System/alert có thể là loại thông điệp, không bắt buộc mỗi loại
là một room riêng.

## 9. Chạy nhiều process

`src/configs/redis.config.ts` bật cả `RedisDriver` và `RedisPresence` khi có `REDIS_URI`,
đồng thời cấu hình cache dùng Redis. Các process cần dùng chung cấu hình Redis để
tra cứu room, gửi RPC và chia sẻ directory. Không cấu hình Redis thì chỉ dùng cho
một process với dữ liệu trong bộ nhớ.

RPC phù hợp khi biết room đích và cần kết quả. Nếu sau này cần phát sự kiện cho nhiều
room mà không cần kết quả từng room, có thể thiết kế pub/sub qua Presence; cần tự
quản lý subscribe/unsubscribe và quy tắc xử lý sự kiện. Các lời gọi party/world mô tả
ở tài liệu này hiện dùng RPC.

Việc typecheck và test trong một process không thay thế kiểm thử thực tế giữa hai
process dùng Redis. Khi triển khai nhiều process, kiểm tra thêm gọi chéo process,
room bị dispose, timeout và thay đổi vị trí người chơi.
