import type { ErrorEnumDoc } from "./collect-errors.js";
import type { OutputFile } from "./write-files.js";
import { GENERATED_HEADER, docText } from "./util.js";

const NAMESPACE = "ERPG.Network";

/** `Errors/<Enum>.cs` cho từng enum mã lỗi (chỉ hằng số + XML doc; hiển thị cho người chơi dùng locale của game). */
export function emitErrors(enums: ErrorEnumDoc[]): OutputFile[] {
    const files: OutputFile[] = [];

    for (const errorEnum of enums) {
        const lines = [
            ...GENERATED_HEADER,
            `// Nguồn: ${errorEnum.file}`,
            "",
            `namespace ${NAMESPACE}`,
            "{",
            `    /// <summary>${docText(errorEnum.doc || errorEnum.name)}</summary>`,
            `    public static class ${errorEnum.name}`,
            "    {",
        ];
        for (const code of errorEnum.codes) {
            if (code.doc) lines.push(`        /// <summary>${docText(code.doc)}</summary>`);
            lines.push(`        public const string ${code.code} = "${code.code}";`);
        }
        lines.push(
            "",
            "        public static readonly string[] Values =",
            "        {",
            ...errorEnum.codes.map((code) => `            ${code.code},`),
            "        };",
            "    }",
            "}",
            ""
        );
        files.push({ path: `Errors/${errorEnum.name}.cs`, content: lines.join("\n") });
    }

    return files;
}
