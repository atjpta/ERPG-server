using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Colyseus;
using UnityEngine;

namespace ERPG.Network
{
    /// <summary>Một message room thất bại — dữ liệu của <see cref="RoomClient.Failed"/>.</summary>
    public readonly struct RoomFailure
    {
        /// <summary>Tên room (<c>world</c>, <c>dungeon</c>, <c>global</c>).</summary>
        public readonly string Room;

        /// <summary>Request thất bại: tên request (<c>WorldClientMessage.X</c>); push thất bại: loại push server gửi xuống (<c>WorldMessage.X</c>).</summary>
        public readonly string Type;

        public readonly Result Result;

        public RoomFailure(string room, string type, Result result)
        {
            Room = room;
            Type = type;
            Result = result;
        }
    }

    /// <summary>
    /// Độ trễ (ping) của một room. Client room tự đo mỗi giây khi đang kết nối; UI chỉ đọc <see cref="PingMilliseconds"/>
    /// và nghe <see cref="PingChanged"/> để cập nhật hiển thị.
    /// </summary>
    public interface IRoomPing
    {
        /// <summary>Vòng đi-về tới server (ms) của lần đo gần nhất; <c>null</c> khi chưa kết nối, chưa có mẫu hoặc mẫu quá cũ.</summary>
        double? PingMilliseconds { get; }

        /// <summary>Bắn khi <see cref="PingMilliseconds"/> đổi (số mới, hoặc <c>null</c> khi mất kết nối / mẫu quá cũ).</summary>
        event Action<double?> PingChanged;
    }

    /// <summary>Phần không phụ thuộc kiểu state của client room: sự kiện lỗi toàn cục.</summary>
    public abstract class RoomClient
    {
        /// <summary>
        /// Bắn cho <b>mọi</b> message room thất bại (đúng một lần mỗi message), trước khi handler riêng chạy.
        /// Đăng ký một lần ở bootstrap để log + toast theo mã lỗi.
        /// </summary>
        public static event Action<RoomFailure> Failed;

        internal static void RaiseFailed(RoomFailure failure)
        {
            NetworkSettings.Verbose($"FAIL room {failure.Room}/{failure.Type} → {failure.Result.code}: {failure.Result.message}");
            try
            {
                Failed?.Invoke(failure);
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
            }
        }
    }

    /// <summary>
    /// Client typed cho một room Colyseus. Lớp con sinh ra (<c>WorldRoomClient</c>, <c>GlobalRoomClient</c>) thêm
    /// hàm request (<c>await EquipItem(...)</c> trả <c>Result&lt;T&gt;</c>) và hàm nhận push (<c>OnChatReceived(...)</c>).
    /// <list type="bullet">
    /// <item>Tạo một lần, đăng ký handler trước hay sau khi join đều được; join lại thì handler tự gắn lại.</item>
    /// <item>Thao tác hỏi-đáp là Request/Response của Colyseus (SDK &gt;= 0.18.3): thất bại (nghiệp vụ / mạng / timeout / bị từ chối) ném <see cref="NetworkException"/> mang <see cref="Result"/> thất bại; dùng try/catch.</item>
    /// <item>Mọi message server đẩy xuống là <see cref="Result{T}"/>: <c>OnX(onOk, onFail)</c> chỉ gọi <c>onOk</c> khi thành công.</item>
    /// <item>Join cần player token (<see cref="NetworkSettings.PlayerToken"/>).</item>
    /// </list>
    /// </summary>
    public class RoomClient<TState> : RoomClient, IRoomPing
        where TState : Colyseus.Schema.Schema
    {
        private Client client;
        private string clientUrl;
        private readonly Dictionary<string, IHub> hubs = new Dictionary<string, IHub>();
        private readonly List<Action> roomUnbinders = new List<Action>();

        /// <summary>Room đang kết nối (<c>null</c> khi chưa join / đã rời).</summary>
        public Room<TState> Room { get; private set; }

        /// <summary>State đồng bộ từ server (<c>null</c> trước khi nhận state đầu tiên).</summary>
        public TState State => Room?.State;

        public string RoomName => Room?.Name;
        public string RoomId => Room?.RoomId;
        public string SessionId => Room?.SessionId;
        public Connection Connection => Room?.Connection;
        public bool IsConnected => Room?.Connection != null && Room.Connection.IsOpen;

        /// <summary>Lỗi của lần join / reconnect gần nhất (<c>null</c> nếu thành công). Mã server: <c>AUTH_*</c>, <c>INVALID_TOKEN</c>...</summary>
        public Result JoinError { get; private set; }

        /// <summary>Đã rời room, kèm close code (xem <see cref="KickCode"/> khi bị đá).</summary>
        public event Action<int> Left;

        /// <summary>Mất kết nối bất ngờ, SDK đang tự nối lại.</summary>
        public event Action<int> Dropped;

        /// <summary>SDK đã tự nối lại thành công.</summary>
        public event Action Reconnected;

        /// <summary>Lỗi của room (code, message).</summary>
        public event Action<int, string> Error;

        /// <summary>State đổi (state, lần đầu).</summary>
        public event Action<TState, bool> StateChanged;

        // ------------------------------------------------------------------ ping

        /// <summary>Đo ping mỗi chừng này (ms) khi đang kết nối.</summary>
        private const int PingIntervalMs = 1000;

        /// <summary>Mẫu cũ hơn chừng này (giây) thì coi như không có (đường truyền đứng).</summary>
        private const double PingMaxAgeSeconds = 5;

        private bool pingPending;
        private double pingSentAt;
        private double pingReceivedAt;
        private int pingMilliseconds;
        private bool pingHasSample;
        private double? pingPublished;

        /// <inheritdoc/>
        public double? PingMilliseconds => CurrentPing();

        /// <inheritdoc/>
        public event Action<double?> PingChanged;

        private double? CurrentPing()
        {
            if (!IsConnected || !pingHasSample) return null;
            return Time.realtimeSinceStartupAsDouble - pingReceivedAt > PingMaxAgeSeconds ? (double?)null : pingMilliseconds;
        }

        /// <summary>Bắn <see cref="PingChanged"/> nếu số hiển thị đổi so với lần bắn trước.</summary>
        private void PublishPing()
        {
            var value = CurrentPing();
            if (value == pingPublished) return;
            pingPublished = value;
            Raise(() => PingChanged?.Invoke(value));
        }

        /// <summary>Vòng đo ping của một room: gửi ping mỗi giây tới khi room này không còn là room hiện tại.</summary>
        private async void RunPingLoop(Room<TState> room)
        {
            pingPending = false;
            pingHasSample = false;
            try
            {
                while (Room == room)
                {
                    var now = Time.realtimeSinceStartupAsDouble;
                    if (room.Connection != null && room.Connection.IsOpen && (!pingPending || now - pingSentAt > PingMaxAgeSeconds))
                    {
                        pingPending = true;
                        pingSentAt = now;
                        room.Ping(milliseconds =>
                        {
                            if (Room != room) return;
                            pingPending = false;
                            pingMilliseconds = Math.Max(0, milliseconds);
                            pingReceivedAt = Time.realtimeSinceStartupAsDouble;
                            pingHasSample = true;
                            PublishPing();
                        });
                    }
                    await Task.Delay(PingIntervalMs);
                    PublishPing(); // mẫu quá cũ -> null
                }
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
            }
            finally
            {
                if (Room != room) PublishPing(); // đã rời: IsConnected false -> null
            }
        }

        // ------------------------------------------------------------------ join / leave

        /// <summary>Vào hoặc tạo room <paramref name="roomName"/>. Trả <c>false</c> nếu lỗi — xem <see cref="JoinError"/>.</summary>
        protected Task<bool> JoinOrCreate(string roomName, object options = null) =>
            JoinWith(c => c.JoinOrCreate<TState>(roomName, ToOptions(options)));

        /// <summary>Vào room đã có theo id Trả <c>false</c> nếu lỗi.</summary>
        public Task<bool> JoinById(string roomId, object options = null) =>
            JoinWith(c => c.JoinById<TState>(roomId, ToOptions(options)));

        /// <summary>Nối lại room vừa rời bất thường bằng reconnection token đã lưu.</summary>
        public Task<bool> Reconnect()
        {
            var token = Room?.ReconnectionToken;
            if (token == null)
            {
                JoinError = Result.Fail(ClientErrorCode.NETWORK_ERROR, "no reconnection token");
                return Task.FromResult(false);
            }
            return JoinWith(c => c.Reconnect<TState>(token));
        }

        /// <summary>Rời room (chủ động). An toàn khi chưa join.</summary>
        public async Task Leave()
        {
            var room = Room;
            if (room == null) return;
            await room.Leave();
            Detach();
        }

        /// <summary>Chờ state đầu tiên từ server (trả ngay nếu đã có).</summary>
        public async Task<TState> WaitForFirstState()
        {
            if (Room == null) return null;
            return await Room.WaitForFirstState();
        }

        private async Task<bool> JoinWith(Func<Client, Task<Room<TState>>> join)
        {
            JoinError = null;
            if (Room != null) await Leave();

            try
            {
                var room = await join(GetClient());
                Attach(room);
                return true;
            }
            catch (MatchMakeException exception)
            {
                JoinError = Result.Fail(exception.Message, exception.Message, exception.Code);
            }
            catch (Exception exception)
            {
                JoinError = Result.Fail(ClientErrorCode.NETWORK_ERROR, exception.Message);
            }

            NetworkSettings.LogWarning?.Invoke($"[Network] join failed: {JoinError.code} ({JoinError.message})");
            return false;
        }

        private Client GetClient()
        {
            var url = NetworkSettings.BaseUrl;
            if (client == null || clientUrl != url)
            {
                client = new Client(url);
                clientUrl = url;
            }
            // Server đọc player token ở onAuth qua header Authorization của request matchmake.
            client.Auth.Token = NetworkSettings.PlayerToken?.Invoke();
            return client;
        }

        private static Dictionary<string, object> ToOptions(object options) =>
            options == null ? null : PayloadConverter.ToWire(options) as Dictionary<string, object>;

        // ------------------------------------------------------------------ room events

        private void Attach(Room<TState> room)
        {
            Room = room;

            CloseWithCodeEventHandler onLeave = code =>
            {
                if (Room != room) return;
                Room = null;
                Unbind();
                Raise(() => Left?.Invoke(code));
            };
            CloseWithCodeEventHandler onDrop = code => Raise(() => Dropped?.Invoke(code));
            NoArgsEventHandler onReconnect = () => Raise(() => Reconnected?.Invoke());
            ErrorEventHandler onError = (code, message) => Raise(() => Error?.Invoke(code, message));
            Room<TState>.StateChangeEventHandler onState = (state, first) => Raise(() => StateChanged?.Invoke(state, first));

            room.OnLeave += onLeave;
            room.OnDrop += onDrop;
            room.OnReconnect += onReconnect;
            room.OnError += onError;
            room.OnStateChange += onState;
            roomUnbinders.Add(() =>
            {
                room.OnLeave -= onLeave;
                room.OnDrop -= onDrop;
                room.OnReconnect -= onReconnect;
                room.OnError -= onError;
                room.OnStateChange -= onState;
            });

            foreach (var hub in hubs.Values) hub.Bind(room);
            RunPingLoop(room);
        }

        private void Detach()
        {
            Room = null;
            Unbind();
        }

        private void Unbind()
        {
            foreach (var unbind in roomUnbinders) unbind();
            roomUnbinders.Clear();
            foreach (var hub in hubs.Values) hub.Unbind();
        }

        private static void Raise(Action action)
        {
            try
            {
                action();
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
            }
        }

        // ------------------------------------------------------------------ request / response

        /// <summary>Thời gian chờ response của mọi request (ms). Mặc định 15s (lớn hơn timeout RPC nội bộ 10s của server khi vào dungeon).</summary>
        public int RequestTimeoutMs { get; set; } = 15000;

        /// <summary>
        /// Gửi request và chờ response <see cref="Result{T}"/>. Thất bại ném <see cref="NetworkException"/> mang <see cref="Result"/> thất bại:
        /// chưa kết nối → <c>NETWORK_ERROR</c>, quá hạn → <c>REQUEST_TIMEOUT</c>, server từ chối / không có handler → <c>REQUEST_FAILED</c>,
        /// lỗi nghiệp vụ → mã của server. Thất bại luôn bắn <see cref="RoomClient.Failed"/> đúng một lần trước khi ném.
        /// </summary>
        protected async Task<Result<TData>> Call<TData>(string type, object payload = null)
        {
            var result = await CallCore<Result<TData>>(type, payload, (code, message, error) => Result<TData>.Fail(code, message, error));
            return Finish(type, result);
        }

        /// <summary>Như <see cref="Call{TData}"/> cho request không có <c>data</c> trong response.</summary>
        protected async Task<Result> Call(string type, object payload = null)
        {
            var result = await CallCore<Result>(type, payload, (code, message, error) => Result.Fail(code, message, error));
            return Finish(type, result);
        }

        private TResult Finish<TResult>(string type, TResult result) where TResult : Result
        {
            if (!result.success)
            {
                RaiseFailed(new RoomFailure(RoomName, type, result));
                throw new NetworkException(result);
            }
            return result;
        }

        private async Task<TResult> CallCore<TResult>(string type, object payload, Func<string, string, object, TResult> fail)
            where TResult : Result
        {
            var room = Room;
            if (room == null || !IsConnected)
                return fail(ClientErrorCode.NETWORK_ERROR, $"chưa kết nối room khi gửi '{type}'", null);
            NetworkSettings.Verbose($"request {room.Name}/{type}");
            try
            {
                var wire = payload == null ? null : PayloadConverter.ToWire(payload);
                var result = await room.Request<TResult>(type, wire, RequestTimeoutMs);
                return result ?? fail(ClientErrorCode.NETWORK_ERROR, "empty response", null);
            }
            catch (TimeoutException)
            {
                return fail(ClientErrorCode.REQUEST_TIMEOUT, $"request '{type}' quá {RequestTimeoutMs}ms", null);
            }
            catch (RequestError requestError)
            {
                return fail(ClientErrorCode.REQUEST_FAILED, $"{requestError.Name}: {requestError.Message}", requestError.Payload);
            }
            catch (Exception exception)
            {
                return fail(ClientErrorCode.NETWORK_ERROR, exception.Message, null);
            }
        }

        // ------------------------------------------------------------------ send

        /// <summary>
        /// Gửi message lên server (fire-and-forget, không có response; thao tác hỏi-đáp dùng <c>Call</c>). Payload là model sinh ra; field <c>null</c> bị bỏ.
        /// Chưa join / mất kết nối thì bỏ qua và ghi cảnh báo.
        /// </summary>
        protected Task Send(string type, object payload = null)
        {
            if (!IsConnected)
            {
                NetworkSettings.LogWarning?.Invoke($"[Network] bỏ qua '{type}': chưa kết nối room");
                return Task.CompletedTask;
            }
            NetworkSettings.Verbose($"send {Room.Name}/{type}");
            return payload == null ? Room.Send(type) : Room.Send(type, PayloadConverter.ToWire(payload));
        }

        // ------------------------------------------------------------------ receive

        /// <summary>
        /// Đăng ký nhận message có dữ liệu. <paramref name="onOk"/> chỉ chạy khi thành công; thất bại bắn
        /// <see cref="RoomClient.Failed"/> rồi gọi <paramref name="onFail"/> (nếu có). Trả hàm huỷ đăng ký.
        /// </summary>
        protected Action OnOk<TData>(string type, Action<TData> onOk, Action<Result> onFail = null)
        {
            var hub = GetHub<TData>(type);
            Action<Result<TData>> handler = result =>
            {
                if (result.success) onOk?.Invoke(result.data);
                else onFail?.Invoke(result);
            };
            return hub.Add(handler);
        }

        /// <summary>Đăng ký nhận message không có dữ liệu: handler chạy cho cả thành công lẫn thất bại.</summary>
        protected Action OnResult(string type, Action<Result> handler)
        {
            if (!hubs.TryGetValue(type, out var existing)) existing = CreateHub<object>(type);
            return existing.AddResult(handler);
        }

        private Hub<TData> GetHub<TData>(string type)
        {
            if (hubs.TryGetValue(type, out var existing))
            {
                if (existing is Hub<TData> typed) return typed;
                throw new InvalidOperationException(
                    $"Message '{type}' đã được đăng ký với kiểu dữ liệu {existing.DataType.Name}, không thể đăng ký thêm {typeof(TData).Name}."
                );
            }
            return CreateHub<TData>(type);
        }

        private Hub<TData> CreateHub<TData>(string type)
        {
            var hub = new Hub<TData>(this, type);
            hubs[type] = hub;
            if (Room != null) hub.Bind(Room);
            return hub;
        }

        private void RemoveHub(string type)
        {
            if (hubs.TryGetValue(type, out var hub))
            {
                hub.Unbind();
                hubs.Remove(type);
            }
        }

        private interface IHub
        {
            Type DataType { get; }
            void Bind(Room<TState> room);
            void Unbind();
            Action AddResult(Action<Result> handler);
        }

        /// <summary>
        /// Một đầu nhận cho mỗi loại message: giải mã <see cref="Result{T}"/> đúng một lần, bắn
        /// <see cref="RoomClient.Failed"/> đúng một lần, rồi chia cho mọi handler.
        /// </summary>
        private sealed class Hub<TData> : IHub
        {
            private readonly RoomClient<TState> owner;
            private readonly string type;
            private readonly List<Action<Result<TData>>> handlers = new List<Action<Result<TData>>>();
            private Action detach;

            public Hub(RoomClient<TState> owner, string type)
            {
                this.owner = owner;
                this.type = type;
            }

            public Type DataType => typeof(TData);

            public void Bind(Room<TState> room)
            {
                detach?.Invoke();
                detach = room.OnMessage<Result<TData>>(type, Dispatch);
            }

            public void Unbind()
            {
                detach?.Invoke();
                detach = null;
            }

            public Action Add(Action<Result<TData>> handler)
            {
                handlers.Add(handler);
                return () =>
                {
                    handlers.Remove(handler);
                    if (handlers.Count == 0 && owner.hubs.TryGetValue(type, out var current) && ReferenceEquals(current, this))
                        owner.RemoveHub(type);
                };
            }

            public Action AddResult(Action<Result> handler) => Add(result => handler(result));

            private void Dispatch(Result<TData> result)
            {
                if (result == null) result = Result<TData>.Fail(ClientErrorCode.NETWORK_ERROR, "empty message");
                if (!result.success) RaiseFailed(new RoomFailure(owner.RoomName, type, result));

                foreach (var handler in handlers.ToArray())
                    RoomClient<TState>.Raise(() => handler(result));
            }
        }
    }
}
