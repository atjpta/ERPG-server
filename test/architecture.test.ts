import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const moduleFolders = new Set([
    "constants",
    "entities",
    "enums",
    "repositories",
    "middlewares",
    "schemas",
    "seeds",
    "types",
    "data",
    "services",
]);

describe("API and shared module architecture", () => {
    it("keeps only shared categories in each module", () => {
        const root = resolve(sourceRoot, "modules");
        for (const module of readdirSync(root, { withFileTypes: true })) {
            assert.ok(module.isDirectory(), `${module.name}: modules must be directories`);
            for (const entry of readdirSync(resolve(root, module.name), { withFileTypes: true })) {
                if (entry.isFile() && entry.name === "README.md") continue;
                assert.ok(
                    entry.isDirectory() && moduleFolders.has(entry.name),
                    `${module.name}/${entry.name}: unsupported module category`
                );
            }
        }
    });

    it("keeps API controllers, services and validators under their role with prefixed exports", () => {
        const root = resolve(sourceRoot, "apis");
        for (const role of readdirSync(root, { withFileTypes: true })) {
            assert.ok(role.isDirectory() && ["admin", "user"].includes(role.name), role.name);
            for (const file of readdirSync(resolve(root, role.name), {
                recursive: true,
                encoding: "utf8",
            }).filter((name) => name.endsWith(".ts"))) {
                const parts = file.split(sep);
                assert.equal(parts.length, 3, file);
                assert.ok(["controllers", "services", "validators"].includes(parts[1]), file);
                assert.ok(parts[2].startsWith(`${role.name}.`), file);
                const source = ts.createSourceFile(
                    file,
                    readFileSync(resolve(root, role.name, file), "utf8"),
                    ts.ScriptTarget.Latest,
                    true
                );
                for (const statement of source.statements) {
                    if (
                        !ts.canHaveModifiers(statement) ||
                        !ts
                            .getModifiers(statement)
                            ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
                    )
                        continue;
                    const declarations = ts.isVariableStatement(statement)
                        ? statement.declarationList.declarations
                        : "name" in statement && statement.name
                          ? [statement]
                          : [];
                    for (const declaration of declarations) {
                        const name = declaration.name!.getText(source);
                        assert.ok(
                            name.toLowerCase().startsWith(role.name),
                            `${file}: ${name} needs a ${role.name} prefix`
                        );
                    }
                }
            }
        }
    });

    it("prevents shared modules and rooms from depending on API, including type-only imports", () => {
        for (const file of readdirSync(sourceRoot, { recursive: true, encoding: "utf8" }).filter(
            (name) => name.endsWith(".ts")
        )) {
            const absolute = resolve(sourceRoot, file);
            const source = readFileSync(absolute, "utf8");
            const origin = file.split(sep);
            for (const entry of ts.preProcessFile(source, true, true).importedFiles) {
                const name = entry.fileName;
                const target = name.startsWith("@/")
                    ? resolve(sourceRoot, name.slice(2))
                    : name.startsWith(".")
                      ? resolve(dirname(absolute), name)
                      : null;
                if (!target) continue;
                const destination = relative(sourceRoot, target).split(sep);
                if (origin[0] === "modules")
                    assert.ok(
                        !["apis", "rooms"].includes(destination[0]),
                        `${file} must not import ${name}`
                    );
                if (origin[0] === "rooms")
                    assert.notEqual(destination[0], "apis", `${file} must not import ${name}`);
                if (origin[0] === "apis" && destination[0] === "apis")
                    assert.equal(
                        origin[1],
                        destination[1],
                        `${file}: share business logic through modules, not the other API role`
                    );
            }
        }
    });
});
