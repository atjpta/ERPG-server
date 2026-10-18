using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Text;

namespace ERPG.Network
{
    /// <summary>
    /// Đổi model sinh ra (class có field public, field tuỳ chọn là <c>null</c>) sang dạng gửi lên server.
    /// Field <c>null</c> bị bỏ hẳn vì Zod <c>.optional()</c> của server từ chối <c>null</c>.
    /// </summary>
    internal static class PayloadConverter
    {
        /// <summary>Dạng cho MsgPack / JSON (message, option room, body): Dictionary / List / giá trị đơn giản.</summary>
        public static object ToWire(object value)
        {
            if (value == null) return null;
            var type = value.GetType();
            if (type.IsPrimitive || value is string || value is decimal) return value;
            if (type.IsEnum) return value.ToString();

            if (value is IDictionary dictionary)
            {
                var map = new Dictionary<string, object>();
                foreach (DictionaryEntry entry in dictionary)
                {
                    var converted = ToWire(entry.Value);
                    if (converted != null) map[Convert.ToString(entry.Key, CultureInfo.InvariantCulture)] = converted;
                }
                return map;
            }

            if (value is IEnumerable enumerable)
            {
                var list = new List<object>();
                foreach (var item in enumerable) list.Add(ToWire(item));
                return list;
            }

            var fields = new Dictionary<string, object>();
            foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
                var converted = ToWire(field.GetValue(value));
                if (converted != null) fields[field.Name] = converted;
            }
            return fields;
        }

        /// <summary>Query string (không có dấu <c>?</c>) từ class query: mảng lặp lại key, field null bị bỏ.</summary>
        public static string ToQuery(object query)
        {
            if (query == null) return string.Empty;
            var wire = ToWire(query) as Dictionary<string, object>;
            if (wire == null) return string.Empty;

            var builder = new StringBuilder();
            foreach (var pair in wire)
            {
                if (pair.Value is List<object> list)
                {
                    foreach (var item in list) Append(builder, pair.Key, item);
                }
                else
                {
                    Append(builder, pair.Key, pair.Value);
                }
            }
            return builder.ToString();
        }

        private static void Append(StringBuilder builder, string key, object value)
        {
            if (value == null) return;
            if (builder.Length > 0) builder.Append('&');
            builder.Append(Uri.EscapeDataString(key)).Append('=').Append(Uri.EscapeDataString(Format(value)));
        }

        private static string Format(object value)
        {
            if (value is bool flag) return flag ? "true" : "false";
            return Convert.ToString(value, CultureInfo.InvariantCulture);
        }
    }
}
