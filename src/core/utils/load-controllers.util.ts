import { readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import type { Endpoint } from "colyseus";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
type ControllerGroups = Record<"admin" | "user", Record<string, Endpoint>>;

// Discover HTTP controllers only under src/apis (or build/apis after compilation).
// rồi gom các export tên kết thúc bằng "Controller" (vd: userAuthController, adminUsersController) thành 1 object.
export async function loadControllers(): Promise<ControllerGroups> {
    const controllers: ControllerGroups = { admin: {}, user: {} };
    const endpointKeys = new Set<string>();
    for (const role of ["admin", "user"] as const) {
        const scanDir = join(srcDir, "apis", role);
        const endpoints = controllers[role];
        const controllerFiles = (readdirSync(scanDir, { recursive: true }) as string[]).filter(
            (file) => /\.controller\.(ts|js)$/.test(file)
        );

        for (const file of controllerFiles) {
            const module = (await import(pathToFileURL(join(scanDir, file)).href)) as Record<
                string,
                unknown
            >;
            for (const [exportName, exportValue] of Object.entries(module)) {
                if (!exportName.endsWith("Controller")) continue;
                for (const [key, endpoint] of Object.entries(
                    exportValue as Record<string, Endpoint>
                )) {
                    if (endpointKeys.has(key)) {
                        throw new Error(`Duplicate endpoint key "${key}" (${file})`);
                    }
                    endpoints[key] = endpoint;
                    endpointKeys.add(key);
                }
            }
        }
    }
    return controllers;
}
