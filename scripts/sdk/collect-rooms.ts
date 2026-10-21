import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import type { ZodType } from "zod";
import { readSdkMessage, readSdkRoom } from "../../src/core/rooms/sdk-room.decorator.js";
import { registerValidatorSchemas } from "./collect-api.js";
import { readEnum } from "./collect-errors.js";
import type { ClientMessageContract, RoomContract, ServerMessageContract } from "./room-types.js";

/*
 * Contract room suy từ code, không cần file khai báo riêng:
 *  - message client: command có `static readonly message = Enum.X`
 *  - payload: Zod schema mà command (hoặc lớp cha) `safeParse`/`parse`/`client.parsePayload(schema, …)`/gán vào `validateSchema`
 *  - kiểu `data` của message server: kiểu đối số tại các chỗ gọi `sendSuccess/sendResult/broadcast*`
 *  - state: generic của class room; cách join: `@SdkRoom` trên class room
 *  - tài liệu (replies, errors, note): `@SdkMessage` trên command (gộp theo lớp cha)
 */

const SEND_FUNCTIONS = /^(send|broadcast)(Success|Error|Result)$/;

function walk(dir: string, filter: (file: string) => boolean, out: string[] = []): string[] {
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, filter, out);
        else if (filter(full)) out.push(full);
    }
    return out;
}

const importModule = async (file: string) =>
    (await import(pathToFileURL(file).href)) as Record<string, unknown>;

export async function collectRooms(root: string) {
    const warnings: string[] = [];
    const config = ts.getParsedCommandLineOfConfigFile(
        join(root, "tsconfig.json"),
        {},
        {
            ...ts.sys,
            onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
                throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
            },
        }
    )!;
    const roomsDir = join(root, "src", "rooms");
    const inRooms = (file: string) => !relative(roomsDir, file).startsWith("..");
    const program = ts.createProgram(
        config.fileNames.filter((file) => inRooms(file) || /[\\/]src[\\/]/.test(file)),
        config.options
    );
    const checker = program.getTypeChecker();
    const rel = (file: string) => relative(root, file).replace(/\\/g, "/");
    const roomOf = (file: string) => {
        const part = relative(roomsDir, file).split(/[\\/]/)[0];
        return part[0].toUpperCase() + part.slice(1);
    };
    const roomFiles = program.getSourceFiles().filter((file) => inRooms(file.fileName));

    const symbolOf = (node: ts.Node): ts.Symbol | undefined => {
        const symbol = checker.getSymbolAtLocation(node);
        return symbol && symbol.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(symbol)
            : symbol;
    };
    /** `Enum.MEMBER` → tên enum, giá trị chuỗi, file khai báo. */
    const enumInfo = (expression: ts.Node) => {
        if (!ts.isPropertyAccessExpression(expression)) return undefined;
        const declaration = symbolOf(expression.expression)?.declarations?.[0];
        if (!declaration || !ts.isEnumDeclaration(declaration)) return undefined;
        const value = (checker.getTypeAtLocation(expression) as ts.StringLiteralType).value;
        if (typeof value !== "string") return undefined;
        return {
            enumName: declaration.name.text,
            value,
            file: declaration.getSourceFile().fileName,
        };
    };

    // ---- payload ----
    await registerValidatorSchemas(
        roomFiles.map((file) => file.fileName).filter((file) => /\.validator\.ts$/.test(file)),
        roomOf
    );
    const baseClassOf = (decl: ts.ClassDeclaration) => {
        const type = decl.heritageClauses?.find((c) => c.token === ts.SyntaxKind.ExtendsKeyword)
            ?.types[0];
        const declaration = type ? symbolOf(type.expression)?.declarations?.[0] : undefined;
        return declaration && ts.isClassDeclaration(declaration) ? declaration : undefined;
    };
    const findSchemaIdentifier = (decl: ts.ClassDeclaration): ts.Identifier | undefined => {
        for (let cls: ts.ClassDeclaration | undefined = decl; cls; cls = baseClassOf(cls)) {
            let found: ts.Identifier | undefined;
            const visit = (node: ts.Node) => {
                if (found) return;
                if (
                    ts.isPropertyDeclaration(node) &&
                    node.name.getText() === "validateSchema" &&
                    node.initializer &&
                    ts.isIdentifier(node.initializer)
                ) {
                    found = node.initializer;
                } else if (
                    ts.isCallExpression(node) &&
                    ts.isPropertyAccessExpression(node.expression) &&
                    /^(safeParse|parse)$/.test(node.expression.name.text) &&
                    ts.isIdentifier(node.expression.expression)
                ) {
                    found = node.expression.expression;
                } else if (
                    ts.isCallExpression(node) &&
                    ts.isPropertyAccessExpression(node.expression) &&
                    node.expression.name.text === "parsePayload" &&
                    ts.isIdentifier(node.arguments[0])
                ) {
                    found = node.arguments[0];
                }
                ts.forEachChild(node, visit);
            };
            visit(cls);
            if (found) return found;
        }
        return undefined;
    };
    const loadSchema = async (identifier: ts.Identifier): Promise<ZodType | null> => {
        const declaration = symbolOf(identifier)?.declarations?.[0];
        if (!declaration || !ts.isVariableDeclaration(declaration)) return null;
        const module = await importModule(declaration.getSourceFile().fileName);
        const value = module[declaration.name.getText()];
        return value && typeof value === "object" && "_zod" in value ? (value as ZodType) : null;
    };

    // ---- command client message ----
    interface Command {
        name: string;
        file: string;
        enumName: string;
        enumFile: string;
        wire: string;
        decl: ts.ClassDeclaration;
    }
    const commands: Command[] = [];
    for (const file of roomFiles.filter((f) => f.fileName.endsWith(".command.ts"))) {
        for (const node of file.statements) {
            if (!ts.isClassDeclaration(node) || !node.name) continue;
            for (const member of node.members) {
                if (
                    ts.isPropertyDeclaration(member) &&
                    member.name.getText() === "message" &&
                    member.initializer
                ) {
                    const info = enumInfo(member.initializer);
                    if (info) {
                        commands.push({
                            name: node.name.text,
                            file: file.fileName,
                            enumName: info.enumName,
                            enumFile: info.file,
                            wire: info.value,
                            decl: node,
                        });
                    }
                }
            }
        }
    }

    // ---- data message server ----
    const typeName = (type: ts.Type): string | null | undefined => {
        if (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void))
            return null;
        if (type.flags & ts.TypeFlags.StringLike) return "string";
        const name = type.aliasSymbol?.name ?? type.symbol?.name;
        return name && !name.startsWith("__") && name !== "Object" ? name : undefined;
    };
    const dataArgType = (node: ts.Expression): ts.Type => {
        // `{ id } satisfies InteractResultMessage` / `x as Y`: lấy kiểu đã khẳng định.
        if (ts.isSatisfiesExpression(node) || ts.isAsExpression(node)) {
            return checker.getTypeFromTypeNode(node.type);
        }
        return checker.getTypeAtLocation(node);
    };
    const serverEnums = new Map<string, { enumName: string; file: string }>();
    const dataNames = new Map<string, Set<string>>();
    for (const file of roomFiles) {
        const visit = (node: ts.Node) => {
            // `sendSuccess/sendError/sendResult` là method của client (`client.sendSuccess(...)`), `broadcast*` là hàm rời.
            const callee = ts.isCallExpression(node)
                ? ts.isIdentifier(node.expression)
                    ? node.expression.text
                    : ts.isPropertyAccessExpression(node.expression)
                      ? node.expression.name.text
                      : undefined
                : undefined;
            if (ts.isCallExpression(node) && callee) {
                const match = SEND_FUNCTIONS.exec(callee);
                const index = match
                    ? node.arguments.findIndex(
                          (arg) => enumInfo(arg) && /Message$/.test(enumInfo(arg)!.enumName)
                      )
                    : -1;
                const info = index >= 0 ? enumInfo(node.arguments[index]) : undefined;
                if (match && info) {
                    serverEnums.set(info.value, { enumName: info.enumName, file: info.file });
                    const names = dataNames.get(info.value) ?? new Set<string>();
                    dataNames.set(info.value, names);
                    const dataArg = node.arguments[index + 1];
                    if (match[2] !== "Error" && dataArg) {
                        const type = dataArgType(dataArg);
                        if (match[2] === "Success") {
                            const name = typeName(type);
                            if (name) names.add(name);
                        } else {
                            for (const part of type.isUnion() ? type.types : [type]) {
                                const property = checker.getPropertyOfType(part, "data");
                                const inner = property
                                    ? typeName(checker.getTypeOfSymbolAtLocation(property, dataArg))
                                    : undefined;
                                if (inner) names.add(inner);
                            }
                        }
                    }
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(file);
    }

    // ---- room class: @SdkRoom + state ----
    interface RoomClass {
        room: string;
        meta: NonNullable<ReturnType<typeof readSdkRoom>>;
        state: string;
    }
    const roomClasses = new Map<string, RoomClass>();
    for (const file of walk(roomsDir, (f) => /\.room\.ts$/.test(f))) {
        const module = await importModule(file);
        for (const [exportName, value] of Object.entries(module)) {
            const meta = typeof value === "function" ? readSdkRoom(value) : undefined;
            if (!meta) continue;
            const decl = program
                .getSourceFile(file)
                ?.statements.find(
                    (s): s is ts.ClassDeclaration =>
                        ts.isClassDeclaration(s) && s.name?.text === exportName
                );
            const generic = decl?.heritageClauses?.[0]?.types[0]?.typeArguments?.[0];
            const stateMember =
                generic && ts.isTypeLiteralNode(generic)
                    ? (generic.members.find((m) => m.name?.getText() === "state") as
                          ts.PropertySignature | undefined)
                    : undefined;
            roomClasses.set(roomOf(file), {
                room: roomOf(file),
                meta,
                state: stateMember?.type?.getText() ?? `${roomOf(file)}State`,
            });
        }
    }

    // ---- ghép ----
    const contracts: RoomContract[] = [];
    for (const [name, roomClass] of roomClasses) {
        const group = commands.filter((command) => roomOf(command.enumFile) === name);
        if (group.length === 0) {
            warnings.push(`${name}: không có command client message`);
            continue;
        }
        const client: Record<string, ClientMessageContract> = {};
        for (const command of group) {
            const identifier = findSchemaIdentifier(command.decl);
            const module = await importModule(command.file);
            const meta = readSdkMessage(module[command.name]);
            client[command.wire] = {
                payload: identifier ? await loadSchema(identifier) : null,
                replies: meta?.replies ?? [],
                errors: meta?.errors ?? [],
                note: meta?.note ?? "",
                documented: !!meta,
            };
        }

        const serverEnum = [...serverEnums.values()].find((entry) => roomOf(entry.file) === name);
        if (!serverEnum) {
            warnings.push(`${name}: không thấy enum message server`);
            continue;
        }
        const server: Record<string, ServerMessageContract> = {};
        for (const member of readEnum(serverEnum.file, serverEnum.enumName).members) {
            const wire = member.value ?? member.code;
            const names = [...(dataNames.get(wire) ?? [])];
            if (names.length > 1)
                warnings.push(`${name}.${wire}: nhiều kiểu data ${names.join(", ")}`);
            server[wire] = { data: names[0] ?? null };
        }

        contracts.push({
            name,
            state: roomClass.state,
            enums: {
                client: group[0].enumName,
                server: serverEnum.enumName,
                file: rel(serverEnum.file),
            },
            joins: roomClass.meta.joins,
            client,
            server,
        });
    }
    return { contracts, warnings };
}
