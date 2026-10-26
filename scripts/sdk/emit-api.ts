import type { ErrorCodeDoc } from "./collect-errors.js";
import type { ApiEndpointInfo } from "./collect-api.js";
import { ModelCollector, flatParams, renderModel } from "./schema-to-csharp.js";
import type { OutputFile } from "./write-files.js";
import { GENERATED_HEADER, docText, identifier, upperFirst, xmlEscape } from "./util.js";

const NAMESPACE = "ERPG.Network";

type CodeIndex = Map<string, ErrorCodeDoc & { enumName: string }>;

const AUTH_ENUM = { none: "ApiAuth.None", user: "ApiAuth.User", player: "ApiAuth.Player" } as const;
const AUTH_DOC = {
    none: "không cần token",
    user: "cần user token (tài khoản, tự gắn từ phiên đăng nhập)",
    player: "cần player token (nhân vật đang chọn, tự gắn)",
} as const;

/** Tên hàm C# từ endpoint key, bỏ tiền tố controller (`userPlayerIndex` → `Index`). */
function methodName(endpoint: ApiEndpointInfo): string {
    const prefix = endpoint.controller.replace(/Controller$/, "");
    const stripped = endpoint.key.startsWith(prefix)
        ? endpoint.key.slice(prefix.length)
        : endpoint.key.replace(new RegExp(`^${endpoint.role}`), "");
    return upperFirst(stripped || endpoint.key);
}

function apiClassName(endpoint: ApiEndpointInfo): string {
    return `${upperFirst(endpoint.controller.replace(/Controller$/, ""))}Api`;
}

function errorList(codes: string[], index: CodeIndex): string[] {
    if (codes.length === 0) return [];
    const lines = [
        "        /// <para>Mã lỗi (<c>Result.code</c>):</para>",
        '        /// <list type="bullet">',
    ];
    for (const code of codes) {
        const info = index.get(code);
        const doc = info?.doc ? docText(info.doc) : "";
        const term = info ? `${info.enumName}.${code}` : code;
        lines.push(
            `        /// <item><term>${xmlEscape(term)}</term><description>${doc}</description></item>`
        );
    }
    lines.push("        /// </list>");
    return lines;
}

export interface ApiEmitResult {
    files: OutputFile[];
    missing: string[];
    warnings: string[];
}

export function emitApi(endpoints: ApiEndpointInfo[], codes: CodeIndex): ApiEmitResult {
    const collector = new ModelCollector();
    const missing: string[] = [];
    const warnings: string[] = [];
    const files: OutputFile[] = [];
    const groups = new Map<string, ApiEndpointInfo[]>();

    for (const endpoint of endpoints) {
        if (!endpoint.meta) {
            missing.push(`${endpoint.file} → ${endpoint.key}`);
            continue;
        }
        if (endpoint.meta.hidden) continue;
        const list =
            groups.get(`${endpoint.role}/${endpoint.module}/${apiClassName(endpoint)}`) ?? [];
        list.push(endpoint);
        groups.set(`${endpoint.role}/${endpoint.module}/${apiClassName(endpoint)}`, list);
    }

    for (const [groupKey, group] of groups) {
        const [role, module, className] = groupKey.split("/");
        const lines = [
            ...GENERATED_HEADER,
            "using System.Collections.Generic;",
            "using System.Threading;",
            "using System.Threading.Tasks;",
            "",
            `namespace ${NAMESPACE}`,
            "{",
            `    /// <summary>Endpoint <c>/${role}</c> — module <c>${module}</c> (src/apis/${role}/${module}). Mọi hàm trả <see cref="Result{T}"/> khi thành công, lỗi thì ném <see cref="NetworkException"/> (mang <see cref="Result"/> thất bại).</summary>`,
            `    public static class ${className}`,
            "    {",
        ];

        for (const endpoint of group) {
            const meta = endpoint.meta!;
            const name = methodName(endpoint);
            const pascalKey = upperFirst(endpoint.key);
            const owner = `${endpoint.role}/${endpoint.module}`;

            const pathParams = [...endpoint.path.matchAll(/:(\w+)/g)].map((match) => match[1]);
            const args: string[] = pathParams.map((param) => `string ${identifier(param)}`);

            let queryType: string | undefined;
            if (endpoint.query) {
                queryType = collector.typeOf(endpoint.query, `${pascalKey}Query`, owner, "input");
                args.push(`${queryType} query`);
            }
            let bodyType: string | undefined;
            if (endpoint.body) {
                bodyType = collector.typeOf(endpoint.body, `${pascalKey}Request`, owner, "input");
                const bodyOptional = (endpoint.body as any)._zod?.def?.type === "optional";
                args.push(`${bodyType} body${bodyOptional ? " = null" : ""}`);
            }
            args.push("CancellationToken ct = default");

            let returnType = "Result";
            let sendGeneric = "";
            if (meta.response === "raw") {
                warnings.push(
                    `${endpoint.key}: response chưa khai báo kiểu (raw) → Result<object>`
                );
                returnType = "Result<object>";
                sendGeneric = "<object>";
            } else if (meta.response) {
                const type = collector.typeOf(
                    meta.response,
                    `${pascalKey}Response`,
                    owner,
                    "output"
                );
                returnType = `Result<${type}>`;
                sendGeneric = `<${type}>`;
            }

            const commonCodes: string[] = [];
            if (meta.auth !== "none") commonCodes.push("MISSING_TOKEN", "INVALID_TOKEN");
            if (endpoint.body || endpoint.query || endpoint.params)
                commonCodes.push("INVALID_INPUT");
            commonCodes.push("INTERNAL_ERROR", "NETWORK_ERROR");
            const allCodes = [...new Set([...(meta.errors ?? []), ...commonCodes])];

            const pathExpr = pathParams.length
                ? `$"${endpoint.path.slice(1).replace(/:(\w+)/g, (_, param) => `{ApiClient.Segment(${identifier(param)})}`)}"`
                : `"${endpoint.path.slice(1)}"`;
            const send = [
                `ApiMethod.${upperFirst(endpoint.method.toLowerCase())}`,
                pathExpr,
                AUTH_ENUM[meta.auth],
            ];
            const named = [
                bodyType ? "body: body" : "",
                queryType ? "query: query" : "",
                "ct: ct",
            ].filter(Boolean);

            lines.push(
                `        /// <summary>${docText(meta.summary)}</summary>`,
                "        /// <remarks>",
                `        /// <para><b>${endpoint.method}</b> <c>${xmlEscape(endpoint.path)}</c> — ${AUTH_DOC[meta.auth]}.</para>`,
                ...pathParams.map(
                    (param) => `        /// <para>Tham số đường dẫn <c>${param}</c>.</para>`
                ),
                ...errorList(allCodes, codes),
                "        /// </remarks>",
                `        public static Task<${returnType}> ${name}(${args.join(", ")}) =>`,
                `            ApiClient.Send${sendGeneric}(${[...send, ...named].join(", ")});`,
                ""
            );
            const bodyOptional = (endpoint.body as any)?._zod?.def?.type === "optional";
            const flat =
                bodyType && !bodyOptional ? flatParams(collector.classes.get(bodyType)) : null;
            if (flat && bodyType) {
                const flatArgs = [
                    ...pathParams.map((p) => `string ${identifier(p)}`),
                    ...(queryType ? [`${queryType} query`] : []),
                    flat.signature,
                ];
                const callArgs = [
                    ...pathParams.map((p) => identifier(p)),
                    ...(queryType ? ["query"] : []),
                    `new ${bodyType} { ${flat.initializer} }`,
                    "ct",
                ];
                lines.push(
                    `        /// <inheritdoc cref="${name}(${[...pathParams.map(() => "string"), ...(queryType ? [queryType] : []), bodyType, "CancellationToken"].join(", ")})"/>`,
                    `        public static Task<${returnType}> ${name}(${[...flatArgs, "CancellationToken ct = default"].join(", ")}) =>`,
                    `            ${name}(${callArgs.join(", ")});`,
                    ""
                );
            }
        }
        lines.pop();
        lines.push("    }", "}", "");
        files.push({
            path: `Api/${upperFirst(role)}/${upperFirst(module)}/${className}.cs`,
            content: lines.join("\n"),
        });
    }

    for (const model of collector.classes.values()) {
        const [role, module] = model.owner.split("/");
        files.push({
            path: `Api/${upperFirst(role)}/${upperFirst(module)}/Models/${model.name}.cs`,
            content: renderModel(model, NAMESPACE),
        });
    }

    warnings.push(...collector.warnings);
    return { files, missing, warnings };
}
