namespace ERPG.Network
{
    /// <summary>Mã lỗi chỉ có phía client (runtime), không có enum trên server.</summary>
    public static class ClientErrorCode
    {
        /// <summary>Không kết nối được máy chủ hoặc phản hồi không đọc được (lỗi phía client, không phải mã từ server).</summary>
        public const string NETWORK_ERROR = "NETWORK_ERROR";

        public static readonly string[] Values = { NETWORK_ERROR };
    }
}
