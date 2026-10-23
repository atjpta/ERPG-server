import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Discover room contracts at both room and feature scope.
 * @param {string} directory
 * @returns {string[]}
 */
export function findRoomSchemaFiles(directory) {
    const name = basename(directory);
    // `schemas/`: Colyseus Schema (state, input) và DTO; `interfaces/`: chỉ DTO gửi client (`*.message.ts`).
    const isSchemaDirectory = ["schema", "schemas"].includes(name);
    const isInterfaceDirectory = name === "interfaces";
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return findRoomSchemaFiles(path);
        if (isSchemaDirectory && entry.isFile() && /\.(state|input|message)\.ts$/.test(entry.name))
            // State chỉ ở server (không field `@type`) thì không có gì để client giải mã.
            return /@type\(/.test(readFileSync(path, "utf8")) ? [path] : [];
        if (isInterfaceDirectory && entry.isFile() && /\.message\.ts$/.test(entry.name))
            return [path];
        return [];
    });
}

/**
 * Tên class Schema chỉ dùng ở server: nằm trong `schemas/*.state.ts` không có field `@type` (state server-only như
 * một state server-only). Codegen vẫn sinh C# rỗng cho chúng vì đi theo import, nên script xoá đi. Trừ class state của
 * chính room (`<Room>State`, vd `GlobalState`) — SDK dùng nó làm kiểu state của `<Room>RoomClient` (room không khai báo state, như global, dùng `Colyseus.NoState`).
 * @param {string} roomsDirectory
 * @returns {string[]}
 */
export function findServerOnlySchemaClasses(roomsDirectory) {
    /** @type {string[]} */
    const names = [];
    const walk = (directory, room) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                walk(path, room ?? entry.name);
            } else if (
                room &&
                basename(directory) === "schemas" &&
                /\.state\.ts$/.test(entry.name)
            ) {
                const source = readFileSync(path, "utf8");
                if (/@type\(/.test(source)) continue;
                const roomState = `${room[0].toUpperCase()}${room.slice(1)}State`;
                for (const match of source.matchAll(/export class (\w+) extends Schema/g)) {
                    if (match[1] !== roomState) names.push(match[1]);
                }
            }
        }
    };
    walk(roomsDirectory, undefined);
    return names;
}
