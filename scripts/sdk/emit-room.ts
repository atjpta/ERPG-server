import { join } from "node:path";
import type { ZodType } from "zod";
import { readEnum, type ErrorCodeDoc } from "./collect-errors.js";
import { ModelCollector, flatParams, renderModel } from "./schema-to-csharp.js";
import type { RoomContract } from "./room-types.js";
import type { OutputFile } from "./write-files.js";
import { GENERATED_HEADER, docText, pascal, xmlEscape } from "./util.js";

const NAMESPACE = "ERPG.Network";
const SCHEMA = "ERPG.Schema";

type CodeIndex = Map<string, ErrorCodeDoc & { enumName: string }>;

function errorList(codes: readonly string[], index: CodeIndex): string[] {
    if (codes.length === 0) return [];
    const lines = [
        "        /// <para>Mã lỗi (<c>Result.code</c>):</para>",
        '        /// <list type="bullet">',
    ];
    for (const code of codes) {
        const info = index.get(code);
        lines.push(
            `        /// <item><term>${xmlEscape(info ? `${info.enumName}.${code}` : code)}</term><description>${info?.doc ? docText(info.doc) : ""}</description></item>`
        );
    }
    lines.push("        /// </list>");
    return lines;
}

/** Tên member của `RoomClient` — hàm request trùng tên thì thêm tiền tố `Send` (vd message `leave` → `SendLeave`). */
const RESERVED_METHODS = new Set([
    "Leave",
    "JoinById",
    "Reconnect",
    "Send",
    "Call",
    "RequestTimeoutMs",
    "Connection",
    "IsConnected",
]);
const sendMethod = (key: string) => {
    const name = pascal(key);
    return RESERVED_METHODS.has(name) ? `Send${name}` : name;
};

const dataType = (data: string | null) =>
    data ? (data === "string" ? "string" : `${SCHEMA}.${data}`) : "Result";

/** Kiểu C# trả về của request: `Result<T>` hoặc `Result` khi response không có data. */
const resultType = (data: string | null) => (data ? `Result<${dataType(data)}>` : "Result");

export interface RoomEmitResult {
    files: OutputFile[];
    warnings: string[];
    /** DTO `...Message` được contract tham chiếu (để export kiểm tra file C# tồn tại). */
    referencedDtos: string[];
}

export function emitRooms(
    root: string,
    contracts: RoomContract[],
    codes: CodeIndex
): RoomEmitResult {
    const files: OutputFile[] = [];
    const warnings: string[] = [];
    const referencedDtos = new Set<string>();

    for (const contract of contracts) {
        const collector = new ModelCollector();
        const enumFile = join(root, contract.enums.file);
        const clientMembers = new Map(
            readEnum(enumFile, contract.enums.client).members.map((m) => [m.value ?? m.code, m])
        );
        const serverMembers = new Map(
            readEnum(enumFile, contract.enums.server).members.map((m) => [m.value ?? m.code, m])
        );
        for (const value of [...Object.keys(contract.client)]) {
            if (!clientMembers.has(value))
                throw new Error(
                    `${contract.name}: message client "${value}" không có trong enum ${contract.enums.client}`
                );
        }
        for (const value of [...Object.keys(contract.server)]) {
            if (!serverMembers.has(value))
                throw new Error(
                    `${contract.name}: message server "${value}" không có trong enum ${contract.enums.server}`
                );
        }
        // Thứ tự theo enum để file sinh ra ổn định.
        const clientKeys = [...clientMembers.keys()].filter((key) => key in contract.client);
        const serverKeys = [...serverMembers.keys()].filter((key) => key in contract.server);

        // push index: server key → các request (client key) đẩy thêm nó như hiệu ứng phụ
        const repliedBy = new Map<string, string[]>();
        for (const key of clientKeys) {
            for (const reply of contract.client[key].replies) {
                repliedBy.set(reply, [...(repliedBy.get(reply) ?? []), key]);
            }
        }

        const lines = [
            ...GENERATED_HEADER,
            "using System;",
            "using System.Collections.Generic;",
            "using System.Threading.Tasks;",
            "using Colyseus.Schema;",
            `using ${SCHEMA};`,
            "",
            `namespace ${NAMESPACE}`,
            "{",
            `    /// <summary>Client typed cho room <c>${contract.joins.map((j) => j.room).join("</c> / <c>")}</c> (state <see cref="${contract.state}"/>). Thao tác hỏi-đáp là hàm <c>async</c> trả <see cref="Result{T}"/> (Request/Response, Colyseus SDK &gt;= 0.18.3); message server tự đẩy xuống nhận bằng <c>On...</c>.</summary>`,
            `    public partial class ${contract.name}RoomClient : RoomClient<${contract.state}>`,
            "    {",
        ];

        // ---- join
        for (const join of contract.joins) {
            lines.push(`        // ---- Join: ${join.room} ----`, "");
            if (join.options) {
                const type = collector.typeOf(
                    join.options as ZodType,
                    `${pascal(join.room)}JoinOptions`,
                    contract.name,
                    "input"
                );
                lines.push(
                    `        /// <summary>${docText(join.doc)} Vào hoặc tạo room <c>${join.room}</c> (cần player token).</summary>`,
                    `        public Task<bool> Join${pascal(join.room)}(${type} options) => JoinOrCreate("${join.room}", options);`,
                    ""
                );
            } else {
                lines.push(
                    `        // ${join.doc} Vào bằng JoinById(roomId) (cần player token).`,
                    ""
                );
            }
        }

        lines.push("        // ---- Client → server (Request/Response) ----", "");
        for (const key of clientKeys) {
            const message = contract.client[key];
            const method = sendMethod(key);
            const result = resultType(message.response);
            if (message.response && message.response !== "string")
                referencedDtos.add(message.response);
            const param = message.payload
                ? collector.typeOf(message.payload, `${method}Payload`, contract.name, "input")
                : undefined;
            const pushes = message.replies.map((value) => `<see cref="On${pascal(value)}"/>`);
            const common = message.payload ? ["INVALID_INPUT"] : [];
            const allCodes = [
                ...new Set([
                    ...message.errors,
                    ...common.filter((c) => !message.errors.includes(c)),
                ]),
            ];
            const call = message.response ? `Call<${dataType(message.response)}>` : "Call";
            lines.push(
                ...(clientMembers.get(key)!.doc
                    ? [`        /// <summary>${docText(clientMembers.get(key)!.doc)}</summary>`]
                    : []),
                "        /// <remarks>",
                `        /// <para>Request <c>${contract.enums.client}.${clientMembers.get(key)!.code}</c> ("${key}"). Lỗi nghiệp vụ / mạng / quá hạn ném <see cref="NetworkException"/> mang <see cref="Result"/> thất bại (<see cref="RoomClient.Failed"/> bắn trước khi ném).</para>`,
                `        /// <para>Response: ${message.response ? (message.response === "string" ? "<c>string</c>" : `<see cref="${SCHEMA}.${message.response}"/>`) : "không có <c>data</c>"}.</para>`,
                ...(pushes.length
                    ? [`        /// <para>Còn đẩy thêm: ${pushes.join(", ")}.</para>`]
                    : []),
                ...(message.note ? [`        /// <para>${docText(message.note)}</para>`] : []),
                ...errorList(allCodes, codes),
                "        /// </remarks>",
                `        public Task<${result}> ${method}(${param ? `${param} payload` : ""}) =>`,
                `            ${call}(${SCHEMA}.${contract.enums.client}.${clientMembers.get(key)!.code}${param ? ", payload" : ""});`,
                ""
            );
            const flat = param ? flatParams(collector.classes.get(param)) : null;
            if (flat && param) {
                lines.push(
                    `        /// <inheritdoc cref="${method}(${param})"/>`,
                    `        public Task<${result}> ${method}(${flat.signature}) =>`,
                    `            ${method}(new ${param} { ${flat.initializer} });`,
                    ""
                );
            }
        }

        // ---- push
        lines.push("        // ---- Server → client (push) ----", "");
        for (const key of serverKeys) {
            const message = contract.server[key];
            if (message.data && message.data !== "string") referencedDtos.add(message.data);
            const method = `On${pascal(key)}`;
            const trigger = repliedBy.get(key);
            lines.push(
                ...(serverMembers.get(key)!.doc
                    ? [`        /// <summary>${docText(serverMembers.get(key)!.doc)}</summary>`]
                    : []),
                "        /// <remarks>",
                ...(message.data
                    ? [
                          '        /// <para>Chỉ gọi <c>onOk</c> khi thành công; thất bại luôn bắn <see cref="RoomClient.Failed"/> và gọi <c>onFail</c> nếu có.</para>',
                      ]
                    : []),
                `        /// <para>Push <c>${contract.enums.server}.${serverMembers.get(key)!.code}</c> ("${key}"). Server tự đẩy xuống${trigger ? `, kèm theo: ${trigger.map((k) => `<see cref="${sendMethod(k)}"/>`).join(", ")}` : ""}.</para>`,
                "        /// </remarks>",
                "        /// <returns>Hàm huỷ đăng ký.</returns>",
                ...(message.data
                    ? [
                          `        public Action ${method}(Action<${dataType(message.data)}> onOk, Action<Result> onFail = null) =>`,
                          `            OnOk(${SCHEMA}.${contract.enums.server}.${serverMembers.get(key)!.code}, onOk, onFail);`,
                      ]
                    : [
                          `        public Action ${method}(Action<Result> handler) =>`,
                          `            OnResult(${SCHEMA}.${contract.enums.server}.${serverMembers.get(key)!.code}, handler);`,
                      ]),
                ""
            );
        }
        lines.pop();
        lines.push("    }", "}", "");
        files.push({
            path: `Room/${contract.name}/${contract.name}RoomClient.cs`,
            content: lines.join("\n"),
        });

        for (const model of collector.classes.values()) {
            files.push({
                path: `Room/${contract.name}/Payloads/${model.name}.cs`,
                content: renderModel(model, NAMESPACE),
            });
        }
        warnings.push(...collector.warnings);
    }

    return { files, warnings, referencedDtos: [...referencedDtos] };
}
