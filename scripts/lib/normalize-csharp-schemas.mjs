/** Colyseus emits string enums as constant structs. JSON payload fields must stay strings. */
export function normalizeCSharpSchemas(files) {
    const stringEnums = new Set(
        [...files.values()].flatMap((source) =>
            [...source.matchAll(/public struct (\w+)\s*\{\s*public const string/g)].map((m) => m[1])
        )
    );
    return new Map(
        [...files].map(([name, source]) => {
            if (/public struct /.test(source)) {
                const constants = [...source.matchAll(/public const string (\w+) =/g)].map(
                    (m) => m[1]
                );
                if (constants.length)
                    source = source.replace(
                        /(\s*)\}\s*\}\s*$/,
                        `\n\t\tpublic static readonly string[] Values = { ${constants.join(", ")} };\n\t}\n}\n`
                    );
            } else {
                source = source.replace(
                    /\bpublic (\w+)(\[\])? (@?\w+);/g,
                    (match, type, array, field) =>
                        stringEnums.has(type) ? `public string${array ?? ""} ${field};` : match
                );
                if (name === "EquipmentsMessage.cs" || name === "WalletMessage.cs") {
                    const fields = [...source.matchAll(/public (\w+) (@?\w+);/g)];
                    const type = fields[0][1];
                    source = source.replace(
                        /\s*\}\s*\}\s*$/,
                        `\n\t\tpublic global::System.Collections.Generic.Dictionary<string, ${type}> ToDictionary() => new() {\n${fields.map(([, , field]) => `\t\t\t["${field.replace(/^@/, "")}"] = ${field},`).join("\n")}\n\t\t};\n\t}\n}\n`
                    );
                }
                // Message DTOs are used through generic deserialization on IL2CPP as well as in the Editor.
                source = source.replace(
                    /(\t)(public class \w+ \{)/g,
                    "$1[global::System.Serializable]\n$1[global::UnityEngine.Scripting.Preserve]\n$1$2"
                );
            }
            return [name, source];
        })
    );
}
