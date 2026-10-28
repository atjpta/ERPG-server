# Định dạng trả về chung

Có **ba lớp**, mỗi lớp một class, tất cả nằm ở `src/core/response/`:

| Class          | Dùng ở                                      | Việc                                                                                                          |
| -------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Response`     | service, state, manager, cổng giữa các room | Kết quả **nội bộ** `Response<T>`: `Response.success(data)` / `Response.error(code, errorData?)`               |
| `HttpResponse` | controller (API user / admin)               | Đổi `Response` thành envelope + HTTP status: `HttpResponse.from(ctx, response)`                               |
| `RoomResponse` | command và service của room                 | Đổi `Response` thành envelope cho Request/Response (`reply`) và đẩy push (`send` / `sendError` / `broadcast`) |

Thứ **gửi cho client** luôn là **một envelope** (HTTP API, response và push của room): kiểu `Result` ở
`src/core/response/result.type.ts`, chỉ MỘT hàm dựng nó là `toEnvelope` (`envelope.ts`) nên API và room luôn giống nhau.

```ts
type Success<T> = { success: true; data: T; code: null; message: string; error: null };
type ErrorResult = {
    success: false;
    data: null;
    code: ErrorCode; // string — giá trị của một enum mã lỗi
    message: string;
    error: ErrorData | null;
};
type Result<T> = Success<T> | ErrorResult;

type Paginated<T> = { items: T[]; pagination: { total: number; page: number; limit: number } };
```

Luôn đủ 5 field, không bao giờ thiếu.

| Field     | Quy tắc                                                                                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `success` | `true` / `false`. Client kiểm tra field này đầu tiên.                                                                                                                              |
| `data`    | Thành công: dữ liệu `T`, không có thì `null`. Danh sách luôn là `Paginated<T>` (rỗng thì `items: []`), không bao giờ là mảng trần. Thất bại: luôn `null`.                          |
| `code`    | Thành công: `null`. Thất bại: một mã lỗi — **unique toàn project**, là thứ client dùng để nhận biết lỗi và tra text đa ngôn ngữ.                                                   |
| `message` | Tiếng Anh cho dev / log, không emoji. Client không hiển thị mà tra locale theo `code`. Luôn suy ra từ `code` (`"OK"` khi thành công), không có text tự do.                         |
| `error`   | Chỉ khi thất bại: dữ liệu kèm theo riêng cho từng `code` (vd `DUNGEON_DENIED` → `{ failures }`, `TOO_MANY_REQUESTS` → `{ retryAfterSeconds }`), hoặc `null`. Client có thể bỏ qua. |

## `Response` (nội bộ)

```ts
import { Response } from "@/core/response/response.js";

type Response<T = null> = { success: true; data: T } | { success: false; errorCode: ErrorCode; errorData?: ErrorData };

Response.success(data?)               // data mặc định null
Response.error(PartyErrorCode.X, { max: 3 })   // errorData tuỳ chọn (thành `error` của envelope)
Response.isError(response)            // type guard (tsconfig tắt strictNullChecks nên `!response.success` không thu hẹp kiểu)
Response.map(response, (data) => ...) // đổi dữ liệu của kết quả thành công, thất bại giữ nguyên
Response.abort(code, errorData?)      // thoát luồng nhiều bước / transaction với mã nghiệp vụ
Response.attempt(async () => ...)     // bắt abort → Response.error (lỗi khác ném tiếp)
Response.fromThrown(error)            // chỗ duy nhất đổi lỗi bị ném thành Response (xem bên dưới)
```

`Response` là object JSON thuần nên đi qua `remoteRoomCall` (Redis) được.

### Quy ước kiểu trả về

- Hàm có thể thất bại vì nghiệp vụ (service, state, manager, cổng giữa room, rpc) → `Response<T>` (async: `Promise<Response<T>>`).
  Không dùng `ErrorCode | undefined`, union `| ErrorCode`, kiểu `*Failure`, hay `Result` làm kết quả nội bộ.
- Hàm không thể thất bại nghiệp vụ → trả giá trị thẳng / `void`.
- Throw chỉ cho lỗi lập trình / cấu hình, `*OrFail` của repo (ném `Response.abort(code)`) và `TransactAbort(response)`.
  `Response.fromThrown` đổi chúng ở biên: `ResponseAbort` giữ mã nghiệp vụ, `ZodError` thành
  `INVALID_INPUT` (`error.issues`), lỗi lạ được log và thành `INTERNAL_ERROR`.
- Controller / command là nơi duy nhất đổi `Response` thành thứ gửi client; service và state không bao giờ gửi client.

## Mã lỗi

- **Không có một enum chung.** Mỗi domain giữ enum mã lỗi của mình, đặt cạnh code dùng nó:
  `CommonCode` (`core/enums`, lỗi chung), `AuthErrorCode`, `MapErrorCode`, `PlayerErrorCode`, `ItemErrorCode`,
  `NpcErrorCode`, `DialogueErrorCode`, `QuestErrorCode`, `MasterDataErrorCode` (mỗi cái trong `enums/` của module),
  `WorldErrorCode`, `PartyErrorCode` và `ChatErrorCode` (trong `types/` của room). Core không import module / room nên chỉ biết `ErrorCode = string`.
- Tên `<DOMAIN>_<LÝ DO>` (`PARTY_NOT_LEADER`, `INVENTORY_FULL`...), value luôn bằng key. Mỗi enum gọi
  `registerErrorCodes(Enum, statuses?)` (`core/response/error-code.ts`) ngay sau khai báo: lúc load sẽ báo lỗi nếu value khác key hoặc **trùng**
  với enum khác, nên mã vẫn unique toàn project. `statuses` là HTTP status của mã khi trả qua API (mặc định 400). Dùng tiền tố domain để tránh trùng.
- Room này cần mã của room khác thì mã đó phải nằm ở module (hoặc `src/rooms/global/modules/party/enums`, vd `PartyErrorCode`), không import từ room kia.
- Mã dùng ở cả module lẫn room (item, player, map) đặt ở module; mã chỉ room mới dùng đặt ở `types/` của room.
- Không trả text lỗi tự do cho client; service trả mã lỗi trong `Response`, không trả chuỗi.
- Thêm lỗi mới = thêm một giá trị vào enum của domain (client map sang text).

## HTTP API (`HttpResponse`)

Controller chỉ có một khuôn: validator → gọi repo / service → trả `HttpResponse`.

```ts
return HttpResponse.from(ctx, await fooService.rename(id, name)); // Response<T> -> envelope + status
return HttpResponse.from(ctx, await fooService.create(body), HttpStatusCode.CREATED);
return HttpResponse.success(foo); // dữ liệu có sẵn (từ repo)
return HttpResponse.created(ctx, foo); // 201
return HttpResponse.page(items, pagination); // { items, pagination }
HttpResponse.notFound(ctx) /
    conflict(ctx, FooErrorCode.X) /
    unauthorized /
    forbidden /
    unprocessable /
    tooManyRequests(ctx, seconds);
```

- `from`: thành công → envelope 200 (hoặc status truyền vào); thất bại → ném envelope lỗi với HTTP status đăng ký cho mã đó
  (`registerErrorCodes(enum, statuses)`, mặc định 400). Không nuốt mã lỗi thành 404.
- Hàm `*OrFail` ném `Response.abort(code)` (mặc định `NOT_FOUND`); `RouterContainer` đổi thành envelope với status đăng ký của mã.
  `ZodError` → `CommonCode.INVALID_INPUT` (422, `error.issues`), lỗi chưa biết → `CommonCode.INTERNAL_ERROR` (500).
- Lỗi validate body / query do framework ném được `routerErrorHandler` (`src/core/response/http-response.ts`) đổi sang envelope.
  Riêng body JSON hỏng (`malformed request body`) vẫn do Colyseus trả.

## Room (`RoomResponse`)

Có hai kiểu, cùng một envelope:

- **Response của Request** (client gọi `room.Request<T>(message, payload)` / JS `room.request`): command gán `this.result = Response.success(data)` hoặc
  `Response.error(Code, errorData?)` (hoặc gán thẳng kết quả của service: `this.result = await svc.x()`); `loadRoomMessages` đổi sang envelope bằng
  `RoomResponse.reply` rồi trả cho Colyseus (frame `OK`). Command không gán `result` thì response là thành công rỗng.
  Exception trong command được `Response.fromThrown` đổi thành `Response` thất bại.
- **Push** (server chủ động đẩy xuống, không có request đi kèm: `mapChange`, `reward`, `chatReceived`, `partyState`...):
  `RoomResponse.send(client, Message.X, data)`, `RoomResponse.sendError(client, Message.X, code, errorData?)`,
  `RoomResponse.broadcast(room, Message.X, data, options?)`; không gọi `client.send()` / `room.broadcast()` trực tiếp.
  Loại sự kiện là member của `WorldMessage` / `GlobalMessage` (nếu cần phân loại thêm thì nằm trong `data`, vd `data.notice` của
  `partyNotice`), không dùng `code`.
- Lỗi giao thức (message không có handler: `no_handler`, quá thời gian chờ) không phải `Result`: SDK client đổi thành
  `Result` thất bại phía client (`REQUEST_FAILED` / `REQUEST_TIMEOUT`, xem [client SDK](client-sdk.md)).
- Một thao tác có thể vừa trả response vừa đẩy push (vd `equipItem`: response thành công rỗng, push `inventoryChanged` + `attributes`); khai push đi kèm trong
  `@SdkMessage.replies`. Thất bại không kèm snapshot trạng thái: client giữ state cũ cho tới khi nhận push cập nhật bình thường.

## Giữa các room

Lời gọi giữa room đi qua `rooms/bus` (`callRoom<T>` → `rpc` của room đích) hoặc dữ liệu dùng chung của `GlobalRoom` (`launchDungeon`, `checkDungeonEntry`,
`enterDungeon`) và trả `Promise<Response<T>>`; room không còn thì `Response.error(CommonCode.ROOM_UNAVAILABLE)`, phân biệt được với lỗi nghiệp vụ
(`PARTY_NOT_MEMBER`...) qua `errorCode`. Handler `rpc` bắt lỗi ném ra bằng `Response.fromThrown`. Xem [tương tác giữa các room](room-interactions.md).
