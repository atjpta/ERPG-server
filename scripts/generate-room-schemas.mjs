import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const roomsDirectory = join(projectRoot, "src", "rooms");
const codegen = join(projectRoot, "node_modules", "@colyseus", "schema", "bin", "schema-codegen");
const unitySchemaOutput = resolve(
    projectRoot,
    process.argv[2] ?? process.env.UNITY_SCHEMA_OUTPUT ?? "../ERPG/Assets/ERPG/Scripts/Models/World"
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

for (const schemaFile of schemaFiles) {
    const source = relative(projectRoot, schemaFile).replaceAll("\\", "/");
    for (const output of outputs) {
        console.log(`Generating ${source} -> ${output.directory}`);

        const result = spawnSync(
            process.execPath,
            [
                codegen,
                source,
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
    }
}

function findRoomSchemaFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((roomEntry) => {
        if (!roomEntry.isDirectory()) return [];

        const schemaDirectory = join(directory, roomEntry.name, "schema");
        if (!existsSync(schemaDirectory)) return [];

        return readdirSync(schemaDirectory, { withFileTypes: true }).flatMap((schemaEntry) => {
            if (!schemaEntry.isFile() || !/\.(state|input)\.ts$/.test(schemaEntry.name)) return [];
            return [join(schemaDirectory, schemaEntry.name)];
        });
    });
}
