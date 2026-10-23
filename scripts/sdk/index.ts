import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { collectApi } from "./collect-api.js";
import { collectErrorEnums, indexCodes } from "./collect-errors.js";
import { emitApi } from "./emit-api.js";
import { emitErrors } from "./emit-errors.js";
import { emitRuntime } from "./emit-runtime.js";
import { collectRooms } from "./collect-rooms.js";
import { emitRooms } from "./emit-room.js";
import { writeFiles, type OutputFile } from "./write-files.js";

/** Tên file `.cs` schema đã sinh (rỗng nếu chưa có — bỏ qua kiểm tra). */
function findSchemaFiles(networkDir: string): Set<string> {
    const names = new Set<string>();
    const visit = (dir: string, inSchema: boolean) => {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory())
                visit(
                    join(dir, entry.name),
                    inSchema || entry.name === "Schema" || entry.name === "Common"
                );
            else if (inSchema && entry.name.endsWith(".cs")) names.add(entry.name);
        }
    };
    visit(join(networkDir, "Room"), false);
    visit(join(networkDir, "Common"), true);
    return names;
}

export interface ExportOptions {
    /** Repo server. */
    root: string;
    /** Thư mục `Network` của Unity. */
    outDir: string;
    /** Thư mục Network chứa schema (Room, Common) để kiểm tra contract room trỏ đúng class DTO. */
    schemaDir: string;
    /** Sinh cả endpoint `/admin` (mặc định chỉ `/user`). */
    admin: boolean;
    /** Chỉ so sánh, không ghi (CI). */
    check: boolean;
}

/** Mã lỗi chỉ có phía client (runtime Unity), không có enum trên server. */
const CLIENT_ONLY_CODES = [
    {
        code: "NETWORK_ERROR",
        doc: "Không kết nối được máy chủ hoặc phản hồi không đọc được (lỗi phía client, không phải mã từ server).",
        enumName: "ClientErrorCode",
    },
    {
        code: "REQUEST_TIMEOUT",
        doc: "Request room không có response trong thời hạn (lỗi phía client).",
        enumName: "ClientErrorCode",
    },
    {
        code: "REQUEST_FAILED",
        doc: "Server từ chối request ở tầng giao thức (không có handler, handler ném lỗi...) — không phải lỗi nghiệp vụ.",
        enumName: "ClientErrorCode",
    },
];

/**
 * Xuất toàn bộ SDK network cho Unity: mã lỗi, API (`/user`, tuỳ chọn `/admin`) và client của từng room.
 * Throw (kèm danh sách lỗi) nếu contract thiếu / sai; trả báo cáo file đã ghi / xoá.
 */
export async function exportClientNetwork(options: ExportOptions) {
    const { root, outDir, schemaDir } = options;
    const errors: string[] = [];
    const warnings: string[] = [];

    const enums = collectErrorEnums(root);
    const codes = indexCodes(enums);
    for (const extra of CLIENT_ONLY_CODES) codes.set(extra.code, extra);

    const endpoints = await collectApi(root, options.admin ? ["user", "admin"] : ["user"]);
    const api = emitApi(endpoints, codes);
    errors.push(...api.missing.map((entry) => `Endpoint thiếu metadata sdk: ${entry}`));

    const collected = await collectRooms(root);
    const contracts = collected.contracts;
    warnings.push(...collected.warnings);
    const rooms = emitRooms(root, contracts, codes);

    for (const endpoint of endpoints) {
        for (const code of endpoint.meta?.errors ?? []) {
            if (!codes.has(code))
                errors.push(`${endpoint.key}: mã lỗi "${code}" không có trong enum nào`);
        }
    }
    for (const contract of contracts) {
        const all = [...Object.values(contract.client).flatMap((message) => message.errors)];
        for (const code of all) {
            if (!codes.has(code))
                errors.push(`${contract.name}: mã lỗi "${code}" không có trong enum nào`);
        }
    }
    const schemaFiles = findSchemaFiles(schemaDir);
    if (schemaFiles.size > 0) {
        for (const dto of rooms.referencedDtos) {
            if (!schemaFiles.has(`${dto}.cs`)) {
                errors.push(`Thiếu ${dto}.cs trong Room/*/Schema của ${schemaDir}`);
            }
        }
    }

    const files: OutputFile[] = [
        ...emitRuntime(),
        ...emitErrors(enums),
        ...api.files,
        ...rooms.files,
    ];
    const seen = new Map<string, string>();
    for (const file of files) {
        const name = file.path.split("/").pop()!;
        if (!/(Models|Payloads)\//.test(file.path) && !file.path.startsWith("Errors/")) continue;
        if (seen.has(name))
            errors.push(`Trùng tên class ${name}: ${seen.get(name)} và ${file.path}`);
        seen.set(name, file.path);
    }

    if (errors.length > 0) {
        throw new Error(`Export network thất bại:\n - ${errors.join("\n - ")}`);
    }

    const report = writeFiles(resolve(outDir), files, options.check);
    return {
        report,
        warnings: [...warnings, ...api.warnings, ...rooms.warnings],
        counts: {
            errorEnums: enums.length,
            endpoints: endpoints.filter((endpoint) => endpoint.meta && !endpoint.meta.hidden)
                .length,
            rooms: contracts.length,
        },
    };
}
