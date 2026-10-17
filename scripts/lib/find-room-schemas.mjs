import { readdirSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Discover room contracts at both room and feature scope.
 * @param {string} directory
 * @returns {string[]}
 */
export function findRoomSchemaFiles(directory) {
    const isSchemaDirectory = ["schema", "schemas"].includes(basename(directory));
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return findRoomSchemaFiles(path);
        if (isSchemaDirectory && entry.isFile() && /\.(state|input|message)\.ts$/.test(entry.name))
            return [path];
        return [];
    });
}
