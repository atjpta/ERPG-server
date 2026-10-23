# Định dạng trả về chung

Mọi thứ server trả cho client đều dùng **một envelope**: HTTP API (user / admin), response và push của
response/push của room, và RPC giữa các room. Kiểu nằm ở `src/core/types/result.type.ts`, helper ở
`src/core/utils/response.util.ts`.

```ts
type Success<T> = { success: true; data: T; code: null; message: string; error: null };
type Failure = {
    success: false;
    data: null;
    code: ErrorCode; // string — giá trị của một enum mã lỗi
    message: string;
    error: ErrorData | null;
};
type Result<T> = Success<T> | Failure;

type Paginated<T> = { items: T[]; pagination: { total: number; page: number; limit: number } };
```

Luôn đủ 5 field, không bao giờ thiếu.

| Field     | Quy tắc                                                                                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `success` | `true` / `false`. Client kiểm tra field này đầu tiên.                                                                                                                              |
| `data`    | Thành công: dữ liệu `T`, không có thì `null`. Danh sách luôn là `Paginated<T>` (rỗng thì `items: []`), không bao giờ là mảng trần. Thất bại: luôn `null`.                          |
| `code`    | Thành công: `null`. Thất bại: một mã lỗi — **unique toàn project**, là thứ client dùng để nhận biết lỗi và tra text đa ngôn ngữ.                                                   |
| `message` | Tiếng Anh cho dev / log, không emoji. Client không hiển thị mà tra locale theo `code`. Mặc định suy ra từ `code`.                                                                  |
| `error`   | Chỉ khi thất bại: dữ liệu kèm theo riêng cho từng `code` (vd `DUNGEON_DENIED` → `{ failures }`, `TOO_MANY_REQUESTS` → `{ retryAfterSeconds }`), hoặc `null`. Client có thể bỏ qua. |

## Helper

```ts
import { Response } from "@/core/utils/response.util.js";

Response.success(data?, message?)                 // Success, data mặc định null
Response.successPage(items, { total, page, limit })
Response.error(PartyErrorCode.X, message?, error?)
Response.isError(result)                      // type guard (tsconfig tắt strictNullChecks nên `!result.success` không thu hẹp kiểu)
```

## Mã lỗi

- **Không có một enum chung.** Mỗi domain giữ enum mã lỗi của mình, đặt cạnh code dùng nó:
  `CommonCode` (`core/enums`, lỗi chung), `AuthErrorCode`, `MapErrorCode`, `PlayerErrorCode`, `ItemErrorCode`,
  `NpcErrorCode`, `DialogueErrorCode`, `QuestErrorCode`, `MasterDataErrorCode` (mỗi cái trong `enums/` của module),
  `WorldErrorCode`, `PartyErrorCode` và `ChatErrorCode` (trong `types/` của room). Core không import module / room nên chỉ biết `ErrorCode = string`.
- Tên `<DOMAIN>_<LÝ DO>` (`PARTY_NOT_LEADER`, `INVENTORY_FULL`...), value luôn bằng key. Mỗi enum gọi
  `registerErrorCodes(Enum)` ngay sau khai báo: lúc load sẽ báo lỗi nếu value khác key hoặc **trùng** với enum khác,
  nên mã vẫn unique toàn project. Dùng tiền tố domain để tránh trùng.
- Room này cần mã của room khác thì mã đó phải nằm ở module (hoặc `src/rooms/runtime`, vd `PartyErrorCode`), không import từ room kia.
- Mã dùng ở cả module lẫn room (item, player, map) đặt ở module; mã chỉ room mới dùng đặt ở `types/` của room.
- Không trả text lỗi tự do cho client; service trả mã lỗi (hoặc `Result`), không trả chuỗi.
- Thêm lỗi mới = thêm một giá trị vào enum của domain (client map sang text).

## HTTP API

- `HttpResponse.ok / created / noContent / badRequest / ...` giữ nguyên cách gọi và HTTP status, bên trong dùng `Response.success()` / `Response.error()`.
- `serviceError(message, status, <Domain>ErrorCode.X)` ném lỗi trong service; `RouterContainer` đổi thành envelope đúng status.
  `ZodError` → `CommonCode.INVALID_INPUT` (`error.issues`), lỗi chưa biết → `CommonCode.INTERNAL_ERROR`.
- Lỗi validate body / query do framework ném được `routerErrorHandler` (`src/core/utils/response.util.ts`) đổi sang envelope.
  Riêng body JSON hỏng (`malformed request body`) vẫn do Colyseus trả.

## Room

Có hai kiểu, cùng một envelope:

- **Response của Request** (client gọi `room.Request<T>(message, payload)` / JS `room.request`): response chính là `Result` mà
  command gán vào `this.result` (`Response.success(data)` hoặc `Response.error(Code, message?, error?)`); handler của `loadRoomMessages` trả nó về cho
  Colyseus (frame `OK`). Không dùng `client.sendSuccess` để trả lời. Command không gán `result` thì response là `Response.success()` rỗng.
  Exception trong command được `Response.fromError` đổi thành `Result` thất bại (`serviceError` giữ mã nghiệp vụ, `PayloadRejected` /
  payload sai thành `INVALID_INPUT`, lỗi lạ thành `INTERNAL_ERROR`).
- **Push** (server chủ động đẩy xuống, không có request đi kèm: `mapChange`, `reward`, `chatReceived`, `partyState`...): dùng method của
  client `client.sendSuccess / sendError / sendResult` (`PlayerClient`, cài vào class client của transport bởi `extendClientSend` ở
  `src/index.ts`) và `room.broadcastSuccess / room.broadcastResult` (`BasePlayerRoom`), không gọi `client.send()` / `room.broadcast()` trực
  tiếp. Loại sự kiện là member của `WorldMessage` / `GlobalMessage` (nếu cần phân loại thêm thì nằm trong `data`, vd `data.notice` của
  `partyNotice`), không dùng `code`.
- Lỗi giao thức (message không có handler: `no_handler`, quá thời gian chờ) không phải `Result`: SDK client đổi thành
  `Result` thất bại phía client (`REQUEST_FAILED` / `REQUEST_TIMEOUT`, xem [client SDK](client-sdk.md)).
- Một thao tác có thể vừa trả response vừa đẩy push (vd `equipItem`: response `Response.success()`, push `inventory` + `attributes`); khai push đi kèm trong
  `@SdkMessage.replies`. Thất bại không kèm snapshot trạng thái: client giữ state cũ cho tới khi nhận push cập nhật bình thường.
- Lỗi nội bộ giữa service / command là `ErrorCode | undefined` hoặc `Result<T>`.

## Giữa các room

Hai room chạy chung process nên không có RPC: lời gọi giữa room đi qua `room.runtime` (`RoomRuntimeService` của game server) (`launchDungeon`, `checkDungeonEntry`,
`enterDungeon`) và trả `Promise<Result>`; room không còn thì `Response.error(CommonCode.ROOM_UNAVAILABLE)`, phân biệt được với lỗi nghiệp vụ
(`PARTY_NOT_MEMBER`...) qua `code`. Xem [tương tác giữa các room](room-interactions.md).
