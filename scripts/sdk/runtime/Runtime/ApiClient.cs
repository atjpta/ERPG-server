using System;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using UnityEngine.Networking;

namespace ERPG.Network
{
    public enum ApiMethod
    {
        Get,
        Post,
        Put,
        Patch,
        Delete,
    }

    /// <summary>Token nào được gắn vào request.</summary>
    public enum ApiAuth
    {
        None,
        User,
        Player,
    }

    /// <summary>Một request API thất bại — dữ liệu của <see cref="ApiClient.Failed"/>.</summary>
    public readonly struct ApiFailure
    {
        public readonly ApiMethod Method;
        public readonly string Path;
        public readonly Result Result;

        public ApiFailure(ApiMethod method, string path, Result result)
        {
            Method = method;
            Path = path;
            Result = result;
        }
    }

    /// <summary>
    /// Gửi HTTP tới <c>/user/...</c>. Các hàm <c>User*Api</c> sinh ra gọi vào đây; code game không cần gọi trực tiếp.
    /// Thành công trả <see cref="Result{T}"/>; lỗi mạng / nghiệp vụ ném <see cref="NetworkException"/> mang đúng <see cref="Result"/> thất bại
    /// (lỗi mạng là <see cref="ClientErrorCode.NETWORK_ERROR"/>). <see cref="Failed"/> bắn trước khi ném.
    /// Ném <see cref="OperationCanceledException"/> khi <c>CancellationToken</c> bị huỷ.
    /// </summary>
    public static class ApiClient
    {
        private static readonly JsonSerializerSettings JsonSettings = new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
            MissingMemberHandling = MissingMemberHandling.Ignore,
        };

        /// <summary>Bắn cho mọi request thất bại, trước khi hàm gọi nhận kết quả — nơi log / toast tập trung.</summary>
        public static event Action<ApiFailure> Failed;

        /// <summary>Token thiếu / hết hạn (<c>MISSING_TOKEN</c>, <c>INVALID_TOKEN</c>): xoá phiên, đưa về màn đăng nhập.</summary>
        public static event Action<Result> Unauthorized;

        /// <summary>Escape một đoạn đường dẫn (id, code...).</summary>
        public static string Segment(string value) => Uri.EscapeDataString(value ?? string.Empty);

        public static Task<Result<T>> Send<T>(
            ApiMethod method,
            string path,
            ApiAuth auth,
            object body = null,
            object query = null,
            CancellationToken ct = default
        ) => Execute<Result<T>>(method, path, auth, body, query, ct);

        public static Task<Result> Send(
            ApiMethod method,
            string path,
            ApiAuth auth,
            object body = null,
            object query = null,
            CancellationToken ct = default
        ) => Execute<Result>(method, path, auth, body, query, ct);

        private static async Task<TResult> Execute<TResult>(
            ApiMethod method,
            string path,
            ApiAuth auth,
            object body,
            object query,
            CancellationToken ct
        )
            where TResult : Result, new()
        {
            var verb = method.ToString().ToUpperInvariant();
            var url = BuildUrl(path, query);
            TResult result;

            using (var request = new UnityWebRequest(url, verb))
            {
                request.downloadHandler = new DownloadHandlerBuffer();
                request.timeout = NetworkSettings.RequestTimeoutSeconds;
                request.SetRequestHeader("Accept", "application/json");
                if (body != null)
                {
                    var json = JsonConvert.SerializeObject(PayloadConverter.ToWire(body), JsonSettings);
                    request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
                    request.SetRequestHeader("Content-Type", "application/json");
                }
                var token = TokenFor(auth);
                if (!string.IsNullOrEmpty(token)) request.SetRequestHeader("Authorization", "Bearer " + token);

                NetworkSettings.Verbose($"{verb} {url}");
                await SendAsync(request, ct);
                ct.ThrowIfCancellationRequested();

                var text = request.downloadHandler?.text;
                var status = request.responseCode;
                if (request.result == UnityWebRequest.Result.ConnectionError)
                {
                    result = NetworkFailure<TResult>(request.error);
                }
                else if (string.IsNullOrWhiteSpace(text))
                {
                    // 204 / thân rỗng: thành công nếu HTTP 2xx.
                    result = status >= 200 && status < 300 ? new TResult { success = true } : NetworkFailure<TResult>($"HTTP {status}");
                }
                else
                {
                    try
                    {
                        result = JsonConvert.DeserializeObject<TResult>(text, JsonSettings) ?? NetworkFailure<TResult>($"HTTP {status}: empty body");
                    }
                    catch (Exception exception)
                    {
                        result = NetworkFailure<TResult>($"HTTP {status}: {exception.Message}");
                    }
                }
            }

            if (!result.success)
            {
                Report(method, path, auth, result);
                throw new NetworkException(result);
            }
            return result;
        }

        private static string BuildUrl(string path, object query)
        {
            var url = $"{NetworkSettings.BaseUrl}/{(path ?? string.Empty).TrimStart('/')}";
            var queryString = PayloadConverter.ToQuery(query);
            return queryString.Length > 0 ? $"{url}?{queryString}" : url;
        }

        private static string TokenFor(ApiAuth auth)
        {
            switch (auth)
            {
                case ApiAuth.User: return NetworkSettings.UserToken?.Invoke();
                case ApiAuth.Player: return NetworkSettings.PlayerToken?.Invoke();
                default: return null;
            }
        }

        private static TResult NetworkFailure<TResult>(string reason)
            where TResult : Result, new() =>
            new TResult { success = false, code = ClientErrorCode.NETWORK_ERROR, message = reason };

        private static void Report(ApiMethod method, string path, ApiAuth auth, Result result)
        {
            NetworkSettings.Verbose($"FAIL {method.ToString().ToUpperInvariant()} {path} → {result.code}: {result.message}");
            try
            {
                Failed?.Invoke(new ApiFailure(method, path, result));
                if (auth != ApiAuth.None && (result.code == CommonCode.MISSING_TOKEN || result.code == CommonCode.INVALID_TOKEN))
                    Unauthorized?.Invoke(result);
            }
            catch (Exception exception)
            {
                UnityEngine.Debug.LogException(exception);
            }
        }

        private static Task SendAsync(UnityWebRequest request, CancellationToken ct)
        {
            var source = new TaskCompletionSource<bool>();
            var registration = ct.CanBeCanceled
                ? ct.Register(() =>
                {
                    try
                    {
                        request.Abort();
                    }
                    catch (Exception)
                    {
                        // request đã xong
                    }
                    source.TrySetResult(true);
                })
                : default;
            var operation = request.SendWebRequest();
            operation.completed += _ =>
            {
                registration.Dispose();
                source.TrySetResult(true);
            };
            return source.Task;
        }
    }
}
