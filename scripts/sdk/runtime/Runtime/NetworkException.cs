using System;

namespace ERPG.Network
{
    /// <summary>
    /// Ném ra khi một request API / room thất bại (nghiệp vụ, mạng, quá hạn...). Mang đúng <see cref="Result"/> mà
    /// lúc thành công bạn nhận được, nên <c>catch</c> đọc <see cref="Result"/> / <see cref="Code"/> / <see cref="Error"/> như bình thường.
    /// </summary>
    public class NetworkException : Exception
    {
        /// <summary>Envelope thất bại (<c>success == false</c>) — cùng hình dạng với kết quả thành công.</summary>
        public Result Result { get; }

        /// <summary>Mã lỗi (so với hằng số trong các class <c>*ErrorCode</c>).</summary>
        public string Code => Result.code;

        /// <summary>Dữ liệu kèm mã lỗi, xem <see cref="Result.ErrorAs{T}"/>.</summary>
        public object Error => Result.error;

        public NetworkException(Result result)
            : base($"{result?.code}: {result?.message}")
        {
            Result = result ?? Result.Fail(ClientErrorCode.NETWORK_ERROR, "unknown error");
        }

        /// <summary>Thất bại với đúng mã này.</summary>
        public bool Is(string errorCode) => Result.Is(errorCode);

        /// <summary>Đọc <see cref="Error"/> thành kiểu <typeparamref name="T"/>.</summary>
        public T ErrorAs<T>() => Result.ErrorAs<T>();
    }
}
