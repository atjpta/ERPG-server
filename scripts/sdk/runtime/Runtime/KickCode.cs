namespace ERPG.Network
{
    /// <summary>
    /// Close code khi server đá client khỏi room (xem <c>KICK_CLOSE_CODES</c> ở server, <c>base-player.room.ts</c>).
    /// Nhận qua <see cref="RoomClient{TState}.Left"/>; đa số trường hợp nên xoá phiên và đưa về màn đăng nhập.
    /// </summary>
    public static class KickCode
    {
        /// <summary>Đăng nhập ở nơi khác (<c>KickReason.DUPLICATE_LOGIN</c>).</summary>
        public const int DuplicateLogin = 4001;
        /// <summary>Tài khoản / nhân vật bị khoá (<c>KickReason.BANNED</c>).</summary>
        public const int Banned = 4002;
        /// <summary>Tài khoản đã bị xoá (<c>KickReason.ACCOUNT_DELETED</c>).</summary>
        public const int AccountDeleted = 4003;
        /// <summary>Phiên bị thu hồi — đổi mật khẩu, đăng xuất mọi nơi (<c>KickReason.SESSION_REVOKED</c>).</summary>
        public const int SessionRevoked = 4004;
        /// <summary>Admin vừa sửa nhân vật — vào lại để nhận dữ liệu mới (<c>KickReason.PLAYER_UPDATED</c>).</summary>
        public const int PlayerUpdated = 4005;

        public static bool IsKick(int closeCode) => closeCode >= DuplicateLogin && closeCode <= PlayerUpdated;

        /// <summary>Có nên vào lại ngay được không (chỉ <see cref="PlayerUpdated"/>); các mã còn lại phải đăng nhập lại.</summary>
        public static bool CanRejoin(int closeCode) => closeCode == PlayerUpdated;

        /// <summary>Giá trị <c>KickReason</c> tương ứng (<c>null</c> nếu không phải mã đá).</summary>
        public static string ReasonOf(int closeCode)
        {
            switch (closeCode)
            {
                case DuplicateLogin: return ERPG.Schema.KickReason.DUPLICATE_LOGIN;
                case Banned: return ERPG.Schema.KickReason.BANNED;
                case AccountDeleted: return ERPG.Schema.KickReason.ACCOUNT_DELETED;
                case SessionRevoked: return ERPG.Schema.KickReason.SESSION_REVOKED;
                case PlayerUpdated: return ERPG.Schema.KickReason.PLAYER_UPDATED;
                default: return null;
            }
        }
    }
}
