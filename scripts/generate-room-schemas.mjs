import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { normalizeCSharpSchemas } from "./lib/normalize-csharp-schemas.mjs";
import { join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const roomsDirectory = join(projectRoot, "src", "rooms");
const codegen = join(projectRoot, "node_modules", "@colyseus", "schema", "bin", "schema-codegen");
const unitySchemaOutput = resolve(
    projectRoot,
    process.argv[2] ?? process.env.UNITY_SCHEMA_OUTPUT ?? "../ERPG/Assets/ERPG/Scripts/Schema"
);

const outputs = [
    {
        directory: join(projectRoot, "generated", "schema", "all"),
        namespace: "ERPG.Schema",
    },
    {
        directory: unitySchemaOutput,
        namespace: "ERPG.Schema",
    },
];

const schemaFiles = findRoomSchemaFiles(roomsDirectory).sort();
if (schemaFiles.length === 0) {
    throw new Error("No room schema files were found");
}

for (const output of outputs) mkdirSync(output.directory, { recursive: true });

for (const output of outputs) {
    const sources = schemaFiles.map((file) => relative(projectRoot, file).replaceAll("\\", "/"));
    console.log(`Generating room schemas -> ${output.directory}`);

    const result = spawnSync(
        process.execPath,
        [
            codegen,
            ...sources,
            "--output",
            output.directory,
            "--csharp",
            "--namespace",
            output.namespace,
            "--tsconfig",
            join(projectRoot, "tsconfig.json"),
        ],
        { cwd: projectRoot, stdio: "inherit" }
    );

    if (result.status !== 0) process.exit(result.status ?? 1);
    const files = new Map(
        readdirSync(output.directory)
            .filter((name) => name.endsWith(".cs"))
            .map((name) => [name, readFileSync(join(output.directory, name), "utf8")])
    );
    for (const [name, source] of normalizeCSharpSchemas(files)) {
        writeFileSync(join(output.directory, name), source);
    }
}

function findRoomSchemaFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((roomEntry) => {
        if (!roomEntry.isDirectory()) return [];

        const schemaDirectory = join(directory, roomEntry.name, "schema");
        if (!existsSync(schemaDirectory)) return [];

        return readdirSync(schemaDirectory, { withFileTypes: true }).flatMap((schemaEntry) => {
            if (!schemaEntry.isFile() || !/\.(state|input|message)\.ts$/.test(schemaEntry.name))
                return [];
            return [join(schemaDirectory, schemaEntry.name)];
        });
    });
}
