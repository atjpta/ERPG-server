import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import { Command, type Dispatcher } from "@colyseus/command";
import type { Client, Room } from "colyseus";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type MessageCommand = {
    new (): Command<Room, { client: Client; payload: unknown }>;
    readonly message: string | number;
};

const discovered = new Map<string, Promise<MessageCommand[]>>();

async function discover(directory: URL): Promise<MessageCommand[]> {
    const root = fileURLToPath(directory);
    const files = (await readdir(root, { recursive: true }))
        .filter((file) => /\.command\.(ts|js)$/.test(file))
        .sort();
    const modules = await Promise.all(
        files.map((file) => import(pathToFileURL(resolve(root, file)).href))
    );
    const commands = new Map<string, MessageCommand>();
    for (const [index, module] of modules.entries()) {
        for (const candidate of Object.values(module)) {
            if (typeof candidate !== "function" || !Object.hasOwn(candidate, "message")) continue;
            const command = candidate as MessageCommand;
            if (
                !(command.prototype instanceof Command) ||
                !["string", "number"].includes(typeof command.message) ||
                command.message === "" ||
                command.message === "*" ||
                (typeof command.message === "number" && !Number.isFinite(command.message))
            )
                throw new Error(`Invalid message command ${candidate.name} (${files[index]})`);
            // Colyseus normalizes numeric keys to strings internally.
            const key = String(command.message);
            if (commands.has(key)) {
                throw new Error(`Duplicate room message "${key}" (${files[index]})`);
            }
            commands.set(key, command);
        }
    }
    return [...commands.values()];
}

type MessageHandler = (
    this: { dispatcher: Pick<Dispatcher<Room>, "dispatch"> },
    client: Client,
    payload: unknown
) => Promise<Result<unknown>>;

/**
 * Load a declarative messages map; Colyseus binds each handler to its room instance.
 *
 * Handler trả `Result`: client gọi bằng Request/Response (`room.Request<T>`) nhận đúng envelope này; client
 * gửi message thường (`room.Send`) thì Colyseus bỏ qua giá trị trả về. Command không gán `result` thì trả `ok()`.
 */
export async function loadRoomMessages(directory: URL): Promise<Record<string, MessageHandler>> {
    const key = directory.href;
    let loading = discovered.get(key);
    if (!loading) {
        loading = discover(directory).catch((error) => {
            discovered.delete(key);
            throw error;
        });
        discovered.set(key, loading);
    }
    const commands = await loading;
    return Object.fromEntries(
        commands.map((Message) => [
            String(Message.message),
            async function (
                this: { dispatcher: Pick<Dispatcher<Room>, "dispatch"> },
                client: Client,
                payload: unknown
            ): Promise<Result<unknown>> {
                const command = new Message();
                try {
                    await this.dispatcher.dispatch(command, { client, payload });
                } catch (error) {
                    return Response.fromError(error);
                }
                return (command as { result?: Result<unknown> }).result ?? Response.success();
            },
        ])
    );
}
