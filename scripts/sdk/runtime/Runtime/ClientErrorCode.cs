namespace ERPG.Network
{
    /// <summary>Mã lỗi chỉ có phía client (runtime), không có enum trên server.</summary>
    public static class ClientErrorCode
    {
        /// <summary>Không kết nối được máy chủ hoặc phản hồi không đọc được (lỗi phía client, không phải mã từ server).</summary>
        public const string NETWORK_ERROR = "NETWORK_ERROR";

        /// <summary>Request room không có response trong thời hạn (<c>RoomClient.RequestTimeoutMs</c>).</summary>
        public const string REQUEST_TIMEOUT = "REQUEST_TIMEOUT";

        /// <summary>Server từ chối request ở tầng giao thức (không có handler, handler ném lỗi...) — không phải lỗi nghiệp vụ.</summary>
        public const string REQUEST_FAILED = "REQUEST_FAILED";

        public static readonly string[] Values = { NETWORK_ERROR, REQUEST_TIMEOUT, REQUEST_FAILED };
    }
}
