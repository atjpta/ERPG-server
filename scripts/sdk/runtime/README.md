# Network (client ↔ ERPG-server)

Assembly `ERPG.Network`. Gọi API và room của server bằng code **sinh tự động**.
Server là nguồn sự thật: đổi endpoint / message / mã lỗi ở server rồi chạy `yarn unity:network` (trong `ERPG-server`).

**Không sửa tay bất cứ file nào ở đây** — mọi thứ (kể cả `Runtime/`, asmdef và README này) do `yarn unity:network` ghi,
được liệt kê trong `.sdk-manifest.json`; file thừa bị xoá khi export lại. Muốn đổi `Runtime/`, asmdef hay README thì sửa ở
server: `ERPG-server/scripts/sdk/runtime/`.

## Thư mục

| Thư mục / file         | Nội dung                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| `ERPG.Network.asmdef`  | Tham chiếu `ColyseusSDK` + `Newtonsoft.Json.dll`                                               |
| `Runtime/`             | `Result`, `ApiClient`, `RoomClient<T>`, `NetworkSettings`, `NetworkSession`, `KickCode`...     |
| `Api/<Role>/<Module>/` | `User*Api` (hàm gọi endpoint) + `Models/` (request / response)                                 |
| `Room/<Room>/`         | `WorldRoomClient` / `GlobalRoomClient`, `Payloads/` (message gửi lên), `Schema/` (state + DTO) |
| `Common/`              | Enum / mã dùng chung (`MapCode`, `ItemCode`, `ClassCode`...)                                   |
| `Errors/`              | Một class hằng số cho mỗi enum mã lỗi (`CommonCode`, `PlayerErrorCode`...) kèm XML doc         |

## Phụ thuộc

- `io.colyseus.sdk` (UPM git) — room, schema, MsgPack.
- `com.unity.nuget.newtonsoft-json` — JSON cho HTTP.
- Server mặc định `http://localhost:2567`.

## Khởi động (một lần)

```csharp
using ERPG.Network;

NetworkSession.Initialize("http://localhost:2567");   // ServerUrl + nạp token đã lưu + tự xoá phiên khi token hỏng

// Tuỳ chọn: lỗi tập trung (log + toast theo locale của game)
ApiClient.Failed += f => Debug.Log($"API {f.Path}: {f.Result.code}");
RoomClient.Failed += f => Debug.Log($"Room {f.Room}/{f.Type}: {f.Result.code}");
NetworkSession.Cleared += () => { /* về màn đăng nhập */ };
```

Muốn tự quản token thì bỏ `NetworkSession`, gán thẳng `NetworkSettings.ServerUrl`, `NetworkSettings.UserToken`, `NetworkSettings.PlayerToken` (hàm trả token).

## Result — mọi thứ server trả về

```csharp
public class Result       { bool success; string code; string message; object error; bool Is(string code); T ErrorAs<T>(); }
public class Result<T> : Result { T data; }   // data chỉ có khi success
```

- **Thất bại ném `NetworkException`** (cả API lẫn request room), mang đúng `Result` thất bại: `ex.Result`, `ex.Code`, `ex.Error`, `ex.Is(code)`, `ex.ErrorAs<T>()`. Thành công trả `Result<T>` như cũ (`success == true`). Dùng `try/catch`; `ApiClient.Failed` / `RoomClient.Failed` vẫn bắn trước khi ném.
- Lỗi mạng (mất kết nối, phản hồi không đọc được) là `ClientErrorCode.NETWORK_ERROR`; request room quá hạn là `REQUEST_TIMEOUT`, server từ chối ở tầng giao thức (không có handler...) là `REQUEST_FAILED`.
- `message` là tiếng Anh cho dev; hiển thị cho người chơi thì tra locale theo `code`.
- Hằng số mã lỗi: `CommonCode.X`, `AuthErrorCode.X`, `PlayerErrorCode.X`... — mỗi hàm sinh ra liệt kê mã nó có thể trả trong XML doc (hover trong IDE).
- Ném `OperationCanceledException` khi `CancellationToken` bị huỷ (không phải `NetworkException`).
- Push (`OnX`) và join (`JoinWorld`... trả `bool` + `JoinError`) không ném.

## Gọi API

Gọi thẳng `User*Api`; token tự gắn theo `auth` của endpoint (`none` / `user` / `player`).

```csharp
// Đăng nhập khách (hoặc Login / Register / GoogleLogin / PlayGamesLogin)
try
{
    var login = await UserAuthApi.GuestLogin(NetworkSession.Platform, NetworkSession.ClientVersion, NetworkSession.Device);
    NetworkSession.SetUser(login.data.token);
}
catch (NetworkException ex) when (ex.Is(MasterDataErrorCode.CLIENT_OUTDATED))
{
    /* bắt buộc cập nhật */
}
catch (NetworkException ex)
{
    Debug.LogWarning(ex.Code);
}

// Danh sách / tạo / chọn nhân vật
var list = await UserPlayerApi.Index();
var created = await UserPlayerApi.Create(name: "An", classCode: ClassCode.SWORDSMAN);
NetworkSession.SetPlayer(created.data.playerToken);
var picked = await UserPlayerApi.Select(id);               // → playerToken mới
NetworkSession.SetPlayer(picked.data.playerToken, id);
```

- Mỗi endpoint có overload nhận object request và overload "phẳng" (chỉ khi mọi field đơn giản). Field tuỳ chọn có mặc định `null` và bị bỏ khỏi body.
- Token hết hạn / thiếu (`MISSING_TOKEN`, `INVALID_TOKEN`) → `ApiClient.Unauthorized` bắn, `NetworkSession` tự `Clear()` và bắn `Cleared`.
- Timeout request: `NetworkSettings.RequestTimeoutSeconds` (mặc định 15 giây).

## Room (realtime)

Chỉ có hai room, mỗi room một client typed: `WorldRoomClient` (kênh của một map; `dungeon` là cùng class, vào bằng `JoinDungeon`) và `GlobalRoomClient` (chat, party, presence, mở dungeon). Tạo **một lần** và giữ lại. Yêu cầu Colyseus Unity SDK **>= 0.18.3** (Request/Response). Join option đều bắt buộc `serverId` (server của nhân vật đang đăng nhập).

```csharp
var world = new WorldRoomClient();
var global = new GlobalRoomClient();

// Push (server tự đẩy xuống): đăng ký trước hay sau khi join đều được; join lại sẽ tự gắn lại.
global.OnChatReceived(chat => Render(chat), failure => Toast(failure.code));
global.OnInventory(inventory => Render(inventory));
world.Left += code =>
{
    if (KickCode.IsKick(code)) { /* bị đá: KickCode.ReasonOf(code) */ }
};

if (!await world.JoinWorld(new WorldJoinOptions { serverId = serverId, mapCode = MapCode.GREENFIELD_VILLAGE }))
{
    Debug.LogWarning(world.JoinError.code);  // vd INVALID_TOKEN
    return;
}
await global.JoinGlobal(new GlobalJoinOptions { serverId = serverId });
await world.WaitForFirstState();             // world.State là Colyseus Schema, đọc / subscribe như thường

// Request/Response: await trả Result<T>; thất bại ném NetworkException (RoomClient.Failed đã bắn trước).
try
{
    var equipped = await world.EquipItem(instanceId);
    var sent = await global.SendWorld("xin chào");
}
catch (NetworkException ex)
{
    Debug.LogWarning(ex.Code);               // mã lỗi nghiệp vụ / NETWORK_ERROR / REQUEST_TIMEOUT / REQUEST_FAILED
}
```

- **Request:** mỗi message client là một hàm `async Task<Result<T>> X(...)` (không có `data` thì `Task<Result>`). Thất bại ném `NetworkException`: chưa kết nối → `NETWORK_ERROR`, quá `RequestTimeoutMs` (mặc định 15 giây) → `REQUEST_TIMEOUT`, server từ chối → `REQUEST_FAILED`.
- **Push:** `OnX(onOk, onFail = null)` chỉ cho message server tự đẩy xuống (`WorldMessage` / `GlobalMessage`) — `onOk` nhận `data` khi thành công; `onFail` nhận `Result` (`code`, `error`). Message không có dữ liệu: `OnX(Action<Result> handler)` chạy cho cả hai nhánh. Mọi `OnX` trả `Action` để huỷ đăng ký.
- **Lỗi tập trung:** `RoomClient.Failed` bắn đúng một lần cho mỗi request / push thất bại, trước khi trả về / trước khi handler riêng chạy.
- **Tên hàm:** theo message (`EquipItem`, `PartyInvite`...); tên trùng thành viên của `RoomClient` được thêm tiền tố `Send` (`SendLeave`). Field `null` không được gửi.
- **Join:** `JoinWorld(options)` / `JoinDungeon(options)` (world), `JoinGlobal(options)` (global). Cần player token; trả `false` nếu lỗi, xem `JoinError`.
- **Sự kiện:** `Left(closeCode)`, `Dropped(closeCode)` (đang tự nối lại), `Reconnected`, `Error(code, message)`, `StateChanged(state, isFirst)`.
- **Ping:** client room tự đo mỗi giây khi đang kết nối (không cần gọi gì). `PingMilliseconds` (`double?`, `null` = chưa kết nối / chưa có mẫu / mẫu quá 5 giây) và sự kiện `PingChanged(double?)`; cả hai nằm trong interface `IRoomPing` nên UI chỉ cần nhận `IRoomPing` rồi nghe sự kiện để cập nhật hiển thị. Có thể gọi `Reconnect()` thủ công; `Leave()` để rời.
- **Bị đá khỏi room** — close code trong `KickCode`:

| Hằng                      | Mã   | Ý nghĩa                            | Client nên làm              |
| ------------------------- | ---- | ---------------------------------- | --------------------------- |
| `KickCode.DuplicateLogin` | 4001 | Đăng nhập ở nơi khác               | Về màn đăng nhập            |
| `KickCode.Banned`         | 4002 | Bị khoá                            | Báo bị khoá                 |
| `KickCode.AccountDeleted` | 4003 | Tài khoản đã xoá                   | Xoá phiên                   |
| `KickCode.SessionRevoked` | 4004 | Phiên bị thu hồi (đổi mật khẩu...) | Về màn đăng nhập            |
| `KickCode.PlayerUpdated`  | 4005 | Admin vừa sửa nhân vật             | Join lại ngay (`CanRejoin`) |

## Thêm / sửa API hoặc message

Làm ở **server**, không sửa file sinh. Quy trình và nguồn khai báo: `ERPG-server/docs/client-sdk.md`. Sau đó:

```bash
cd ERPG-server
yarn unity:network         # ghi vào Unity (chỉ ghi file đổi, xoá file cũ không còn)
yarn unity:network:check   # chỉ so sánh phần SDK (CI)
```

## Lưu ý kỹ thuật

- Handler của room chạy trên main thread (Colyseus dùng SynchronizationContext của Unity); không cần `Dispatch`.
- Body / payload gửi lên được chuyển sang dictionary và **bỏ field `null`** (Zod `.optional()` của server từ chối `null`).
- Model sinh ra có `[Preserve]` nên không bị IL2CPP strip.
- Hàm trong `modules/**/simulation/*.step.ts` của server là hợp đồng với bản C# tương ứng (client prediction) — nằm ngoài thư mục này.
