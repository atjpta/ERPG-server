import { z, type ZodType } from "zod";
import { GENERATED_HEADER, identifier, summaryLines, upperFirst } from "./util.js";

/*
 * Zod schema → class C#. Schema đã `registerSchemaIds` (có id) thành class riêng dùng chung; object ẩn danh
 * được đặt tên theo class cha + tên field. Field giữ nguyên tên JSON (camelCase) như các DTO sinh bởi
 * unity:network để JSON/MessagePack map thẳng.
 */

type Json = Record<string, any>;

export interface ModelField {
    name: string;
    type: string;
    doc?: string;
    /** Field không bắt buộc (server chấp nhận thiếu). */
    optional?: boolean;
}

export interface ModelClass {
    name: string;
    /** Module (thư mục) sở hữu class — theo nơi khai báo schema. */
    owner: string;
    doc?: string;
    fields: ModelField[];
}

/** id đã đăng ký → module sở hữu. */
const ownerById = new Map<string, string>();

/** Đăng ký schema vào registry của Zod với id → toJSONSchema tách thành `$defs` có tên. */
export function registerSchemaId(schema: ZodType, id: string, owner: string): void {
    if (ownerById.has(id) && z.globalRegistry.get(schema)?.id !== id) {
        throw new Error(`Schema id "${id}" bị trùng giữa các file validator`);
    }
    if (z.globalRegistry.get(schema)?.id) return;
    z.globalRegistry.add(schema, { id });
    ownerById.set(id, owner);
}

export class ModelCollector {
    readonly classes = new Map<string, ModelClass>();
    readonly warnings: string[] = [];

    /** Chuyển schema thành kiểu C#; class phát sinh được lưu trong `classes`. */
    typeOf(schema: ZodType, hint: string, owner: string, io: "input" | "output"): string {
        const json = z.toJSONSchema(schema, {
            metadata: z.globalRegistry,
            io,
            unrepresentable: "any",
        }) as Json;
        const defs: Json = json.$defs ?? {};
        delete json.$defs;
        return this.convert(json, defs, hint, owner);
    }

    private convert(node: Json, defs: Json, hint: string, owner: string): string {
        if (node.$ref) {
            const id = String(node.$ref).replace("#/$defs/", "");
            const def = defs[id];
            if (!this.classes.has(id)) {
                const fromRegistry = ownerById.get(id) ?? owner;
                // đặt chỗ trước để tham chiếu vòng không lặp vô hạn
                this.classes.set(id, { name: id, owner: fromRegistry, fields: [] });
                this.fillClass(this.classes.get(id)!, def, defs);
            }
            return id;
        }

        if (node.anyOf || node.oneOf) {
            const variants = (node.anyOf ?? node.oneOf) as Json[];
            const nonNull = variants.filter((variant) => variant.type !== "null");
            if (nonNull.length === 1) return this.convert(nonNull[0], defs, hint, owner);
            this.warnings.push(`${hint}: union nhiều kiểu → object`);
            return "object";
        }

        if (node.enum || node.const !== undefined) return "string";

        // Zod ghi nullable của kiểu đơn giản dạng `type: ["string", "null"]`.
        if (Array.isArray(node.type)) {
            const rest = node.type.filter((type: string) => type !== "null");
            if (rest.length === 1)
                return this.convert({ ...node, type: rest[0] }, defs, hint, owner);
            return "object";
        }

        switch (node.type) {
            case "string":
                return "string";
            case "integer":
                return "int";
            case "number":
                return "double";
            case "boolean":
                return "bool";
            case "array":
                return `List<${this.convert(node.items ?? {}, defs, `${hint}Item`, owner)}>`;
            case "object": {
                if (node.properties) {
                    const name = hint;
                    if (!this.classes.has(name)) {
                        this.classes.set(name, { name, owner, fields: [] });
                        this.fillClass(this.classes.get(name)!, node, defs);
                    }
                    return name;
                }
                const value = node.additionalProperties;
                return `Dictionary<string, ${
                    value && typeof value === "object"
                        ? this.convert(value, defs, `${hint}Value`, owner)
                        : "object"
                }>`;
            }
            default:
                return "object";
        }
    }

    private fillClass(target: ModelClass, node: Json, defs: Json): void {
        target.doc = node.description;
        const required = new Set<string>(node.required ?? []);
        for (const [key, value] of Object.entries<Json>(node.properties ?? {})) {
            const base = target.name.replace(/(Response|Request)$/, "");
            let type = this.convert(value, defs, `${base}${upperFirst(key)}`, target.owner);
            const nullable =
                !required.has(key) ||
                (value.anyOf ?? []).some((variant: Json) => variant.type === "null") ||
                (Array.isArray(value.type) && value.type.includes("null"));
            if (nullable && ["int", "double", "bool"].includes(type)) type += "?";
            const doc = [value.description, enumDoc(value)].filter(Boolean).join(" ");
            target.fields.push({ name: key, type, doc: doc || undefined, optional: nullable });
        }
    }
}

function enumDoc(node: Json): string | undefined {
    const values: unknown[] | undefined =
        node.enum ?? (node.const !== undefined ? [node.const] : undefined);
    if (!values) return undefined;
    return `Giá trị: ${values.map((value) => `\`${String(value)}\``).join(", ")}.`;
}

const FLAT_TYPES = new Set([
    "string",
    "int",
    "double",
    "bool",
    "int?",
    "double?",
    "bool?",
    "List<string>",
    "List<int>",
    "List<double>",
]);

/**
 * Tham số phẳng cho overload "gọi thẳng" của một payload/body: chỉ khi mọi field là kiểu đơn giản.
 * Field bắt buộc đứng trước, field tuỳ chọn có mặc định `null` (C# yêu cầu tham số mặc định ở cuối).
 */
export function flatParams(
    model: ModelClass | undefined
): { signature: string; initializer: string } | null {
    if (!model || model.fields.length === 0 || model.fields.length > 10) return null;
    if (!model.fields.every((field) => FLAT_TYPES.has(field.type))) return null;
    const ordered = [
        ...model.fields.filter((f) => !f.optional),
        ...model.fields.filter((f) => f.optional),
    ];
    const signature = ordered
        .map((field) => `${field.type} ${identifier(field.name)}${field.optional ? " = null" : ""}`)
        .join(", ");
    const initializer = model.fields
        .map((field) => `${identifier(field.name)} = ${identifier(field.name)}`)
        .join(", ");
    return { signature, initializer };
}

/** Sinh nội dung file `.cs` của một model. */
export function renderModel(model: ModelClass, namespace: string): string {
    const lines = [
        ...GENERATED_HEADER,
        "using System;",
        "using System.Collections.Generic;",
        "using UnityEngine.Scripting;",
        "",
        `namespace ${namespace}`,
        "{",
        ...summaryLines(model.doc, "    "),
        "    [Serializable]",
        "    [Preserve]",
        `    public class ${model.name}`,
        "    {",
    ];
    for (const field of model.fields) {
        lines.push(...summaryLines(field.doc, "        "));
        // Unity chỉ serialize field Dictionary khi có [SerializeField] (analyzer UAC1015).
        const attribute = field.type.startsWith("Dictionary<")
            ? "[UnityEngine.SerializeField] "
            : "";
        lines.push(`        ${attribute}public ${field.type} ${identifier(field.name)};`);
    }
    lines.push("    }", "}", "");
    return lines.join("\n");
}
