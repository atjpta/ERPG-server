import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

/** Một mã lỗi cùng chú thích JSDoc ở server. */
export interface ErrorCodeDoc {
    code: string;
    doc: string;
    /** Giá trị chuỗi của member (wire name với enum message). */
    value?: string;
}

export interface ErrorEnumDoc {
    /** Tên enum (`AuthErrorCode`). */
    name: string;
    /** Chú thích đầu enum. */
    doc: string;
    /** File nguồn, tương đối so với root server. */
    file: string;
    codes: ErrorCodeDoc[];
}

function jsDocOf(node: ts.Node): string {
    const docs = (node as { jsDoc?: ts.JSDoc[] }).jsDoc;
    if (!docs?.length) return "";
    const comment = docs[docs.length - 1].comment;
    return typeof comment === "string"
        ? comment
        : (comment?.map((part) => part.text).join("") ?? "");
}

/** Mọi enum member + JSDoc của một enum trong file (đọc bằng compiler API, không import runtime). */
export function readEnum(file: string, enumName: string): { doc: string; members: ErrorCodeDoc[] } {
    const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true
    );
    let result: { doc: string; members: ErrorCodeDoc[] } | undefined;
    source.forEachChild((node) => {
        if (ts.isEnumDeclaration(node) && node.name.text === enumName) {
            result = {
                doc: jsDocOf(node),
                members: node.members.map((member) => ({
                    code: member.name.getText(source),
                    doc: jsDocOf(member),
                    value:
                        member.initializer && ts.isStringLiteralLike(member.initializer)
                            ? member.initializer.text
                            : undefined,
                })),
            };
        }
    });
    if (!result) throw new Error(`Không tìm thấy enum ${enumName} trong ${file}`);
    return result;
}

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.name.endsWith(".ts")) out.push(full);
    }
    return out;
}

/** Tìm mọi enum mã lỗi (file gọi `registerErrorCodes(Enum)`) dưới `src/`. */
export function collectErrorEnums(root: string): ErrorEnumDoc[] {
    const result: ErrorEnumDoc[] = [];
    for (const file of walk(join(root, "src"))) {
        const text = readFileSync(file, "utf8");
        const match = text.match(/^registerErrorCodes\((\w+)\);/m);
        if (!match) continue;
        const { doc, members } = readEnum(file, match[1]);
        result.push({
            name: match[1],
            doc,
            file: relative(root, file).replace(/\\/g, "/"),
            codes: members,
        });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
}

/** code → doc; dùng để chú thích mã lỗi trong XML doc của hàm. */
export function indexCodes(
    enums: ErrorEnumDoc[]
): Map<string, ErrorCodeDoc & { enumName: string }> {
    const index = new Map<string, ErrorCodeDoc & { enumName: string }>();
    for (const errorEnum of enums) {
        for (const code of errorEnum.codes)
            index.set(code.code, { ...code, enumName: errorEnum.name });
    }
    return index;
}
