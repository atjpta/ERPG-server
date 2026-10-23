import { env } from "@/configs/env.config.js";

export type ProcessRole = "global" | "world";

const ALL_ROLES: readonly ProcessRole[] = ["global", "world"];

/** Vai trò của process này (env `PROCESS_ROLES`); sai tên thì khởi động thất bại. */
export const processRoles = (): ReadonlySet<ProcessRole> => {
    const names = (env.PROCESS_ROLES ?? ALL_ROLES.join(","))
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
    const roles = new Set<ProcessRole>();
    for (const name of names) {
        if (!(ALL_ROLES as readonly string[]).includes(name)) {
            throw new Error(`PROCESS_ROLES: unknown role "${name}" (use ${ALL_ROLES.join(", ")})`);
        }
        roles.add(name as ProcessRole);
    }
    if (roles.size === 0) throw new Error("PROCESS_ROLES is empty");
    return roles;
};

export const hostsGlobal = () => processRoles().has("global");
export const hostsWorld = () => processRoles().has("world");

/** Room `global` do process có vai trò `global` chạy; `world` và `dungeon` do vai trò `world`. */
export const roleOfRoom = (roomName: string): ProcessRole =>
    roomName === "global" ? "global" : "world";
