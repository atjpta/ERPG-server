using System;
using Newtonsoft.Json;
using UnityEngine.Scripting;

namespace ERPG.Network
{
    /// <summary>
    /// Envelope chung của server (API, message room): luôn đủ 5 field. Kiểm tra <see cref="success"/> trước,
    /// lỗi nhận biết bằng <see cref="code"/> (so với hằng số trong các class <c>*ErrorCode</c>).
    /// Thành công có dữ liệu thì dùng <see cref="Result{T}"/>.
    /// </summary>
    [Preserve]
    public class Result
    {
        public bool success;

        /// <summary>Thành công: <c>null</c>. Thất bại: mã lỗi (so với <c>CommonCode.X</c>, <c>PlayerErrorCode.X</c>...).</summary>
        public string code;

        /// <summary>Tiếng Anh cho dev / log — không hiển thị cho người chơi, hãy tra locale theo <see cref="code"/>.</summary>
        public string message;

        /// <summary>Dữ liệu kèm theo mã lỗi (tuỳ mã), hoặc <c>null</c>. Đọc có kiểu bằng <see cref="ErrorAs{T}"/>.</summary>
        public object error;

        /// <summary>Thất bại với đúng mã này.</summary>
        public bool Is(string errorCode) => !success && code == errorCode;

        /// <summary>Đọc <see cref="error"/> thành kiểu <typeparamref name="T"/>; <c>default</c> nếu không có hoặc sai dạng.</summary>
        public T ErrorAs<T>()
        {
            if (error == null) return default;
            try
            {
                return JsonConvert.DeserializeObject<T>(JsonConvert.SerializeObject(error));
            }
            catch (Exception)
            {
                return default;
            }
        }

        public override string ToString() => success ? "Ok" : $"Fail({code}: {message})";

        public static Result Ok() => new Result { success = true };

        public static Result Fail(string code, string message = null, object error = null) =>
            new Result { success = false, code = code, message = message ?? code, error = error };
    }

    /// <summary>
    /// <see cref="Result"/> có dữ liệu. <see cref="data"/> chỉ có giá trị khi <c>success</c>; thất bại luôn là <c>default</c>.
    /// </summary>
    [Preserve]
    public class Result<T> : Result
    {
        public T data;

        public static Result<T> Ok(T data) => new Result<T> { success = true, data = data };

        public new static Result<T> Fail(string code, string message = null, object error = null) =>
            new Result<T> { success = false, code = code, message = message ?? code, error = error };
    }
}
