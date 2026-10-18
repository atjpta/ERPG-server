using System;
using UnityEngine;

namespace ERPG.Network
{
    /// <summary>
    /// Cấu hình toàn cục của tầng network. Gán một lần lúc khởi động (xem <see cref="NetworkSession"/>):
    /// <c>ServerUrl</c>, token, log. Token là hàm để luôn đọc giá trị mới nhất.
    /// </summary>
    public static class NetworkSettings
    {
        /// <summary>URL gốc của server, vd <c>http://localhost:2567</c> hoặc <c>https://api.erpg.game</c> (dùng chung cho HTTP và WebSocket).</summary>
        public static string ServerUrl = "http://localhost:2567";

        /// <summary>Token tài khoản (gắn cho endpoint <c>auth: user</c>).</summary>
        public static Func<string> UserToken = () => null;

        /// <summary>Token nhân vật (gắn cho endpoint <c>auth: player</c> và khi join room).</summary>
        public static Func<string> PlayerToken = () => null;

        /// <summary>Timeout một request HTTP, giây.</summary>
        public static int RequestTimeoutSeconds = 15;

        /// <summary>Ghi log từng request / message thất bại. Mặc định chỉ log trong Editor và Development Build.</summary>
        public static bool VerboseLog = Debug.isDebugBuild;

        /// <summary>Nơi ghi log; mặc định <c>Debug.Log</c>.</summary>
        public static Action<string> Log = message => Debug.Log(message);

        public static Action<string> LogWarning = message => Debug.LogWarning(message);

        internal static string BaseUrl => (ServerUrl ?? string.Empty).TrimEnd('/');

        internal static void Verbose(string message)
        {
            if (VerboseLog) Log?.Invoke($"[Network] {message}");
        }
    }
}
