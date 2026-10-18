import { readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { ZodType } from "zod";
import type { SdkEndpointMeta } from "../../src/core/utils/sdk-meta.util.js";
import { registerSchemaId } from "./schema-to-csharp.js";

export interface ApiEndpointInfo {
    role: "user" | "admin";
    /** Thư mục module trong `src/apis/<role>/<module>` (vd `player`). */
    module: string;
    /** Tên export controller (`userPlayerController`). */
    controller: string;
    /** Endpoint key (`userPlayerIndex`). */
    key: string;
    method: string;
    /** Path đầy đủ gồm tiền tố role (`/user/players/:id/select`). */
    path: string;
    body?: ZodType;
    query?: ZodType;
    params?: ZodType;
    meta?: SdkEndpointMeta;
    file: string;
}

function walk(dir: string, filter: (file: string) => boolean, out: string[] = []): string[] {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, filter, out);
        else if (filter(full)) out.push(full);
    }
    return out;
}

const isZod = (value: unknown): value is ZodType =>
    !!value && typeof value === "object" && "_zod" in (value as object);

/** `UserCreatePlayerSchema` → `UserCreatePlayerRequest`; `UserMapCodeParamSchema` → `UserMapCodeParam`. */
function schemaId(exportName: string): string {
    const base = exportName.replace(/Schema$/, "");
    if (exportName.endsWith("Schema"))
        return /(Param|Query|Body|Request)$/.test(base) ? base : `${base}Request`;
    return base;
}

/** Đăng ký id cho mọi Zod schema export trong `validators/*.ts` của một nhóm file (id = tên export). */
export async function registerValidatorSchemas(files: string[], owner: (file: string) => string) {
    for (const file of files) {
        const module = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
        for (const [name, value] of Object.entries(module)) {
            if (isZod(value)) registerSchemaId(value, schemaId(name), owner(file));
        }
    }
}

/** Quét controller `src/apis/<role>/**` và đọc `metadata.sdk` của từng endpoint. */
export async function collectApi(
    root: string,
    roles: ("user" | "admin")[]
): Promise<ApiEndpointInfo[]> {
    const apis = join(root, "src", "apis");
    const moduleOf = (file: string) => relative(apis, file).split(sep)[1];
    const ownerOf = (file: string) => relative(apis, file).split(sep).slice(0, 2).join("/");

    const validators = walk(apis, (file) => /\.(validator|response)\.ts$/.test(file));
    await registerValidatorSchemas(validators, ownerOf);

    const result: ApiEndpointInfo[] = [];
    for (const role of roles) {
        const controllers = walk(join(apis, role), (file) => /\.controller\.ts$/.test(file));
        for (const file of controllers) {
            const module = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
            for (const [controller, group] of Object.entries(module)) {
                if (!controller.endsWith("Controller")) continue;
                for (const [key, endpoint] of Object.entries(group as Record<string, any>)) {
                    const options = endpoint.options ?? {};
                    result.push({
                        role,
                        module: moduleOf(file),
                        controller,
                        key,
                        method: String(
                            Array.isArray(options.method) ? options.method[0] : options.method
                        ),
                        path: `/${role}${endpoint.path}`,
                        body: options.body,
                        query: options.query,
                        params: options.params,
                        meta: options.sdk,
                        file: relative(root, file).replace(/\\/g, "/"),
                    });
                }
            }
        }
    }
    return result;
}
