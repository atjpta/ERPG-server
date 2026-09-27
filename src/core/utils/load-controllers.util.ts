import { readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import type { Endpoint } from "colyseus";

const srcDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
const scanDirs = ["modules", "rooms"].map((dir) => join(srcDir, dir));

// Quét mọi file `*.controller.ts`/`*.controller.js` trong src/modules và src/rooms (đệ quy), import động,
// rồi gom các export tên kết thúc bằng "Controller" (vd: authController, adminUsersController) thành 1 object.
export async function loadControllers(): Promise<Record<string, Endpoint>> {
    const endpoints: Record<string, Endpoint> = {};
    for (const scanDir of scanDirs) {
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
                    if (endpoints[key]) {
                        throw new Error(`Duplicate endpoint key "${key}" (${file})`);
                    }
                    endpoints[key] = endpoint;
                }
            }
        }
    }
    return endpoints;
}
