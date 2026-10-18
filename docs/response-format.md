# Định dạng trả về chung

Mọi thứ server trả cho client đều dùng **một envelope**: HTTP API (user / admin), reply và sự kiện của
room, và RPC giữa các room. Kiểu nằm ở `src/core/types/result.type.ts`, helper ở
`src/core/utils/result.util.ts`.

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
import { fail, isFail, ok, okPage } from "@/core/utils/result.util.js";

ok(data?, message?)                 // Success, data mặc định null
okPage(items, { total, page, limit })
fail(PartyErrorCode.X, message?, error?)
isFail(result)                      // type guard (tsconfig tắt strictNullChecks nên `!result.success` không thu hẹp kiểu)
```

## Mã lỗi

- **Không có một enum chung.** Mỗi domain giữ enum mã lỗi của mình, đặt cạnh code dùng nó:
  `CommonCode` (`core/enums`, lỗi chung), `AuthErrorCode`, `MapErrorCode`, `PlayerErrorCode`, `ItemErrorCode`,
  `NpcErrorCode`, `DialogueErrorCode`, `QuestErrorCode`, `MasterDataErrorCode` (mỗi cái trong `enums/` của module),
  `WorldErrorCode` và `PartyErrorCode` (trong `types/` của room). Core không import module / room nên chỉ biết `ErrorCode = string`.
- Tên `<DOMAIN>_<LÝ DO>` (`PARTY_NOT_LEADER`, `INVENTORY_FULL`...), value luôn bằng key. Mỗi enum gọi
  `registerErrorCodes(Enum)` ngay sau khai báo: lúc load sẽ báo lỗi nếu value khác key hoặc **trùng** với enum khác,
  nên mã vẫn unique toàn project. Dùng tiền tố domain để tránh trùng.
- Room này cần mã của room khác thì import qua `<room>.shared.ts` (vd `PartyErrorCode` export từ `party.shared.ts`).
- Mã dùng ở cả module lẫn room (item, player, map) đặt ở module; mã chỉ room mới dùng đặt ở `types/` của room.
- Không trả text lỗi tự do cho client; service trả mã lỗi (hoặc `Result`), không trả chuỗi.
- Thêm lỗi mới = thêm một giá trị vào enum của domain (client map sang text).

## HTTP API

- `Response.ok / created / noContent / badRequest / ...` giữ nguyên cách gọi và HTTP status, bên trong dùng `ok()` / `fail()`.
- `serviceError(message, status, <Domain>ErrorCode.X)` ném lỗi trong service; `RouterContainer` đổi thành envelope đúng status.
  `ZodError` → `CommonCode.INVALID_INPUT` (`error.issues`), lỗi chưa biết → `CommonCode.INTERNAL_ERROR`.
- Lỗi validate body / query do framework ném được `routerErrorHandler` (`src/core/utils/response.util.ts`) đổi sang envelope.
  Riêng body JSON hỏng (`malformed request body`) vẫn do Colyseus trả.

## Room

- **Mọi** message server gửi xuống client đều là `Result`: dùng `sendOk / sendFail / sendResult / broadcastOk /
broadcastResult` trong `src/core/utils/room-send.util.ts`, không gọi `client.send()` / `room.broadcast()` trực tiếp.
- Reply cho yêu cầu của client: thành công `sendOk(client, type, data)`; thất bại `sendFail(client, type, code, error?)`.
  Thất bại không kèm snapshot trạng thái — client giữ state cũ cho tới khi nhận message cập nhật bình thường.
- Sự kiện server đẩy xuống (`mapChange`, `partyNotice`, `reward`...) cũng `sendOk`; loại sự kiện nằm trong `data`
  (vd `data.notice` của `PartyMessage.NOTICE`), không dùng `code`.
- Lỗi nội bộ giữa service / command là `ErrorCode | undefined` hoặc `Result<T>`.

## RPC giữa các room

- Gọi bằng `callRoom(roomId, XCommand, payload)` (`src/core/rooms/room.integration.ts`): kiểu payload và kết quả suy ra từ
  chính class command, Ctrl+click vào tên command nhảy thẳng tới logic.
- Room nhận RPC liệt kê command được phép gọi: `readonly runRpc = createRpcRunner(this, [XCommand, ...])`.
  Command ngoài danh sách thì trả `fail(CommonCode.NOT_FOUND)`.
- Command RPC nhận một object payload và ghi `Result<T>` vào `result` (không cần dữ liệu thì `result = ok()`).
- Timeout hoặc room không còn: `callRoom` trả `fail(CommonCode.ROOM_UNAVAILABLE)`, phân biệt được với lỗi
  nghiệp vụ (`PARTY_NOT_MEMBER`...) qua `code`.
