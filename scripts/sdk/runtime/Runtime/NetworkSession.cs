using System;
using UnityEngine;

namespace ERPG.Network
{
    /// <summary>
    /// Phiên đăng nhập phía client: giữ user token + player token (lưu <c>PlayerPrefs</c> để mở game lại không phải đăng nhập)
    /// và nối vào <see cref="NetworkSettings"/>. Gọi <see cref="Initialize"/> một lần lúc khởi động.
    /// </summary>
    public static class NetworkSession
    {
        private const string UserTokenKey = "erpg.userToken";
        private const string PlayerTokenKey = "erpg.playerToken";
        private const string PlayerIdKey = "erpg.playerId";

        private static bool initialized;

        public static string UserToken { get; private set; }
        public static string PlayerToken { get; private set; }
        public static string PlayerId { get; private set; }

        public static bool HasUser => !string.IsNullOrEmpty(UserToken);
        public static bool HasPlayer => !string.IsNullOrEmpty(PlayerToken);

        /// <summary>Bắn sau khi phiên bị xoá (đăng xuất, token hết hạn, bị đá) — nơi đưa về màn đăng nhập.</summary>
        public static event Action Cleared;

        /// <summary>Giá trị <c>platform</c> gửi lúc đăng nhập (<c>ClientPlatform.X</c> của server).</summary>
        public static string Platform
        {
            get
            {
#if UNITY_ANDROID
                return ERPG.Schema.ClientPlatform.ANDROID;
#else
                return ERPG.Schema.ClientPlatform.PC;
#endif
            }
        }

        /// <summary>Phiên bản client gửi lúc đăng nhập (server so với <c>CLIENT_OUTDATED</c>).</summary>
        public static string ClientVersion => Application.version;

        /// <summary>Định danh thiết bị gửi lúc đăng nhập (tuỳ chọn).</summary>
        public static string Device => SystemInfo.deviceUniqueIdentifier;

        /// <summary>
        /// Nối vào tầng network: đặt <c>ServerUrl</c>, nạp token đã lưu, tự xoá phiên khi API báo token hỏng.
        /// Gọi lặp lại chỉ cập nhật <paramref name="serverUrl"/>.
        /// </summary>
        public static void Initialize(string serverUrl)
        {
            if (!string.IsNullOrEmpty(serverUrl)) NetworkSettings.ServerUrl = serverUrl;
            if (initialized) return;
            initialized = true;

            UserToken = SafeGet(UserTokenKey);
            PlayerToken = SafeGet(PlayerTokenKey);
            PlayerId = SafeGet(PlayerIdKey);

            NetworkSettings.UserToken = () => UserToken;
            NetworkSettings.PlayerToken = () => PlayerToken;
            ApiClient.Unauthorized += _ => Clear();
        }

        /// <summary>Lưu phiên tài khoản sau khi đăng nhập / đăng ký (<c>result.data.token</c>...).</summary>
        public static void SetUser(string userToken)
        {
            UserToken = userToken;
            PlayerToken = null;
            PlayerId = null;
            Save();
        }

        /// <summary>Lưu nhân vật đang chọn (<c>UserPlayerApi.Select/Create</c> → <c>playerToken</c>; id nhân vật nếu có).</summary>
        public static void SetPlayer(string playerToken, string playerId = null)
        {
            PlayerToken = playerToken;
            PlayerId = playerId;
            Save();
        }

        /// <summary>Bỏ nhân vật đang chọn nhưng giữ phiên tài khoản (về màn chọn nhân vật).</summary>
        public static void ClearPlayer()
        {
            PlayerToken = null;
            PlayerId = null;
            Save();
        }

        /// <summary>Xoá toàn bộ phiên (đăng xuất, token hết hạn, bị đá).</summary>
        public static void Clear()
        {
            var had = HasUser || HasPlayer;
            UserToken = null;
            PlayerToken = null;
            PlayerId = null;
            Save();
            if (had) Cleared?.Invoke();
        }

        private static void Save()
        {
            try
            {
                SafeSet(UserTokenKey, UserToken);
                SafeSet(PlayerTokenKey, PlayerToken);
                SafeSet(PlayerIdKey, PlayerId);
                PlayerPrefs.Save();
            }
            catch (Exception exception)
            {
                Debug.LogWarning($"[Network] không lưu được phiên: {exception.Message}");
            }
        }

        private static string SafeGet(string key)
        {
            try
            {
                var value = PlayerPrefs.GetString(key, string.Empty);
                return string.IsNullOrEmpty(value) ? null : value;
            }
            catch (Exception)
            {
                return null;
            }
        }

        private static void SafeSet(string key, string value)
        {
            if (string.IsNullOrEmpty(value)) PlayerPrefs.DeleteKey(key);
            else PlayerPrefs.SetString(key, value);
        }
    }
}
