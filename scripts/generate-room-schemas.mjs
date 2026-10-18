import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { findRoomSchemaFiles } from "./lib/find-room-schemas.mjs";
import { buildRoomIndex, distributeSchemas } from "./lib/distribute-schemas.mjs";
import { normalizeCSharpSchemas } from "./lib/normalize-csharp-schemas.mjs";
import { join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const roomsDirectory = join(projectRoot, "src", "rooms");
// Shared client contracts are explicit inputs rather than incidental imports through room implementations.
const sharedContractFiles = [
    join(projectRoot, "src", "rooms", "world", "types", "world-message.type.ts"),
    join(projectRoot, "src", "modules", "auth", "enums", "admin.enum.ts"),
    join(projectRoot, "src", "rooms", "party", "types", "party-message.type.ts"),
];
const codegen = join(projectRoot, "node_modules", "@colyseus", "schema", "bin", "schema-codegen");
// Thư mục Network của Unity: schema được xếp theo room (Room/<Room>/Schema, Common) sau khi codegen.
const unityNetworkOutput = resolve(
    projectRoot,
    process.argv[2] ?? process.env.UNITY_NETWORK_OUTPUT ?? "../ERPG/Assets/Src/Scripts/Network"
);

const outputs = [
    {
        directory: join(projectRoot, "generated", "schema", "all"),
        namespace: "ERPG.Schema",
    },
    {
        // Thư mục phẳng trung gian; phân phối vào Network/ ở cuối.
        directory: join(projectRoot, "generated", "schema", "unity"),
        namespace: "ERPG.Schema",
    },
];

const schemaFiles = findRoomSchemaFiles(roomsDirectory).sort();
if (schemaFiles.length === 0) {
    throw new Error("No room schema files were found");
}

for (const output of outputs) {
    rmSync(output.directory, { recursive: true, force: true });
    mkdirSync(output.directory, { recursive: true });
}

for (const output of outputs) {
    const sources = [...schemaFiles, ...sharedContractFiles].map((file) =>
        relative(projectRoot, file).replaceAll("\\", "/")
    );
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

// Code catalogs are also used outside room payloads. Respect every configured schema output.
for (const output of outputs) {
    const catalogResult = spawnSync(
        process.execPath,
        ["--import=tsx", "scripts/generate-catalog-codes.ts", "--schema-output", output.directory],
        { cwd: projectRoot, stdio: "inherit" }
    );
    if (catalogResult.status !== 0) process.exit(catalogResult.status ?? 1);
}

const distributed = distributeSchemas({
    flatDirectory: outputs[1].directory,
    networkDirectory: unityNetworkOutput,
    roomIndex: buildRoomIndex(roomsDirectory),
});
console.log(
    `Schema -> ${unityNetworkOutput}: ${distributed.total} file, ghi ${distributed.written}, xoá ${distributed.removed}`
);
