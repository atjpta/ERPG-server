import { strict as assert } from "node:assert";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CATALOG_CODES } from "@/seeds/catalog-codes.constant.js";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import { assertCatalogCodeList, checkCatalogCodes } from "@/seeds/catalog-codes.check.js";
import { exportCatalogCodes } from "@/seeds/catalog-codes.export.js";
import ts from "typescript";
import { pgTable } from "drizzle-orm/pg-core";

describe("shared catalog codes", () => {
    it("covers every authored catalog, including generated equipment/dialogues and daily quests", () => {
        checkCatalogCodes();
    });

    it("rejects missing, stale and duplicate codes before sync", () => {
        assert.throws(
            () => assertCatalogCodeList("skills", ["new"], ["old"]),
            /missing enum codes \[new\].*missing authoring data \[old\]/
        );
        assert.throws(() => assertCatalogCodeList("skills", ["a", "a"], ["a"]), /duplicate/);
        assert.throws(() => assertCatalogCodeList("skills", ["a"], ["a", "a"]), /duplicate/);
    });

    it("can publish registered codes before Unity authors them, while rejecting client-only codes", () => {
        assert.doesNotThrow(() =>
            assertCatalogCodeList("skills", ["existing"], ["existing", "registered_next"], false)
        );
        assert.throws(
            () => assertCatalogCodeList("skills", ["client_only"], ["registered_next"], false),
            /missing enum codes \[client_only\]/
        );
        assert.throws(
            () => assertCatalogCodeList("skills", ["existing"], ["existing", "registered_next"]),
            /missing authoring data \[registered_next\]/
        );
    });

    it("requires every baseWithCodeColumns entity to use an enum from the sync registry", async () => {
        const root = new URL("../src/modules/", import.meta.url);
        let count = 0;
        for (const file of readdirSync(root, { recursive: true, encoding: "utf8" }).filter((file) =>
            file.endsWith(".entity.ts")
        )) {
            const source = ts.createSourceFile(
                file,
                readFileSync(new URL(file.replaceAll("\\", "/"), root), "utf8"),
                ts.ScriptTarget.Latest,
                true
            );
            const calls: ts.CallExpression[] = [];
            const visit = (node: ts.Node) => {
                if (
                    ts.isCallExpression(node) &&
                    node.expression.getText(source) === "baseWithCodeColumns"
                )
                    calls.push(node);
                ts.forEachChild(node, visit);
            };
            visit(source);
            for (const call of calls) {
                count++;
                assert.equal(call.arguments.length, 1, `${file}: must declare a code enum`);
                const name = call.arguments[0].getText(source);
                const declaration = source.statements.find(
                    (statement): statement is ts.ImportDeclaration =>
                        ts.isImportDeclaration(statement) &&
                        !!statement.importClause?.namedBindings &&
                        ts.isNamedImports(statement.importClause.namedBindings) &&
                        statement.importClause.namedBindings.elements.some(
                            (element) => element.name.text === name
                        )
                );
                assert.ok(declaration, `${file}: code enum must be imported`);
                const path = (declaration.moduleSpecifier as ts.StringLiteral).text
                    .replace("@/", "../src/")
                    .replace(/\.js$/, ".ts");
                const codes = (await import(new URL(path, import.meta.url).href))[name];
                assert.ok(
                    Object.values(CATALOG_CODES).some(
                        (registered) => JSON.stringify(registered) === JSON.stringify(codes)
                    ),
                    `${file}: enum must be synced to Unity`
                );
                assert.deepEqual(
                    pgTable("catalog_code_test", baseWithCodeColumns(codes)).code.enumValues,
                    Object.values(codes)
                );
            }
        }
        assert.ok(count >= 9);
    });

    it("exports exact enum values to dropdown JSON and C# constants without a database", () => {
        const root = mkdtempSync(join(tmpdir(), "erpg-codes-"));
        try {
            exportCatalogCodes(root);
            const json = JSON.parse(
                readFileSync(join(root, "Assets/ERPG/ServerData/codes.json"), "utf8")
            );
            const directory = join(root, "Assets/ERPG/Scripts/Schema");
            const sources = readdirSync(directory).map((file) =>
                readFileSync(join(directory, file), "utf8")
            );
            assert.equal(sources.length, Object.keys(CATALOG_CODES).length);
            for (const [kind, codes] of Object.entries(CATALOG_CODES)) {
                assert.deepEqual(
                    json[kind],
                    Object.values(codes)
                        .sort()
                        .map((code) => ({ code }))
                );
                assert.ok(
                    sources.some((source) =>
                        Object.entries(codes).every(([key, value]) =>
                            source.includes(
                                `public const string ${key} = ${JSON.stringify(value)};`
                            )
                        )
                    ),
                    `${kind}: C# constants match the enum`
                );
            }
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
