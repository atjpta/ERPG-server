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

/** Tên member của `RoomClient` — hàm gửi trùng tên thì thêm tiền tố `Send` (vd message `leave` → `SendLeave`). */
const RESERVED_METHODS = new Set([
    "Leave",
    "JoinById",
    "Reconnect",
    "Send",
    "Connection",
    "IsConnected",
]);
const sendMethod = (key: string) => {
    const name = pascal(key);
    return RESERVED_METHODS.has(name) ? `Send${name}` : name;
};

const dataType = (data: string | null) =>
    data ? (data === "string" ? "string" : `${SCHEMA}.${data}`) : "Result";

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

        // reply index: server key → các hàm gửi (client key) trả lời nó
        const repliedBy = new Map<string, string[]>();
        for (const key of clientKeys) {
            for (const reply of contract.client[key].replies) {
                repliedBy.set(reply, [...(repliedBy.get(reply) ?? []), key]);
            }
        }

        const lines = [
            ...GENERATED_HEADER,
            "using System;",
            "using System.Threading.Tasks;",
            "using Colyseus.Schema;",
            `using ${SCHEMA};`,
            "",
            `namespace ${NAMESPACE}`,
            "{",
            `    /// <summary>Client typed cho room <c>${contract.joins.map((j) => j.room).join("</c> / <c>")}</c> (state <see cref="${contract.state}"/>). Gửi bằng các hàm <c>Send...</c>/tên hành động, nhận bằng <c>On...</c>; mọi message server là <see cref="Result{T}"/>.</summary>`,
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

        // ---- send
        lines.push("        // ---- Client → server ----", "");
        for (const key of clientKeys) {
            const message = contract.client[key];
            const method = sendMethod(key);
            const param = message.payload
                ? collector.typeOf(message.payload, `${method}Payload`, contract.name, "input")
                : undefined;
            const replies = message.replies.map((value) => `<see cref="On${pascal(value)}"/>`);
            const common = message.payload ? ["INVALID_INPUT"] : [];
            const allCodes = [
                ...new Set([
                    ...message.errors,
                    ...common.filter((c) => !message.errors.includes(c)),
                ]),
            ];
            lines.push(
                ...(clientMembers.get(key)!.doc
                    ? [`        /// <summary>${docText(clientMembers.get(key)!.doc)}</summary>`]
                    : []),
                "        /// <remarks>",
                `        /// <para>Tên message: <c>${contract.enums.client}.${clientMembers.get(key)!.code}</c> ("${key}"). Fire-and-forget: kết quả đến qua handler đã đăng ký.</para>`,
                ...(replies.length
                    ? [`        /// <para>Trả lời qua: ${replies.join(", ")}.</para>`]
                    : message.documented
                      ? ["        /// <para>Không có reply.</para>"]
                      : []),
                ...(message.note ? [`        /// <para>${docText(message.note)}</para>`] : []),
                ...errorList(allCodes, codes),
                "        /// </remarks>",
                `        public Task ${method}(${param ? `${param} payload` : ""}) =>`,
                `            Send(${SCHEMA}.${contract.enums.client}.${clientMembers.get(key)!.code}${param ? ", payload" : ""});`,
                ""
            );
            const flat = param ? flatParams(collector.classes.get(param)) : null;
            if (flat && param) {
                lines.push(
                    `        /// <inheritdoc cref="${method}(${param})"/>`,
                    `        public Task ${method}(${flat.signature}) =>`,
                    `            ${method}(new ${param} { ${flat.initializer} });`,
                    ""
                );
            }
        }

        // ---- receive
        lines.push("        // ---- Server → client ----", "");
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
                `        /// <para>Tên message: <c>${contract.enums.server}.${serverMembers.get(key)!.code}</c> ("${key}"). ${trigger ? ` Gửi bởi: ${trigger.map((k) => `<see cref="${sendMethod(k)}"/>`).join(", ")}.` : ""}</para>`,
                "        /// </remarks>",
                "        /// <returns>Hàm huỷ đăng ký.</returns>",
                ...(message.data
                    ? [
                          '        /// <para>Chỉ gọi <c>onOk</c> khi thành công; thất bại luôn bắn <see cref="RoomClient.Failed"/> và gọi <c>onFail</c> nếu có.</para>',
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
