// Prints the Android signing env for the Unity client (ERPG/Assets/Src/Scripts/Editor/AndroidSigning.cs).
// The keystore lives encrypted in .env.production; this decrypts it with the dotenvx private key and
// prints PowerShell lines to paste into a terminal, or `--sha1` to print the fingerprint for the Google OAuth client.
//
//   Add `--env development` to read .env.development instead of .env.production (default).
//   yarn android:signing           -> $env:ERPG_... lines (PowerShell)
//   yarn android:signing --sha1    -> SHA-1 / SHA-256 of the keystore
//   yarn android:signing --file out.keystore   -> write the keystore file
//   yarn android:signing --json    -> {"base64","pass","alias"} (used by the Unity Hub "Add from server" button)
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const get = (key) =>
    execFileSync("dotenvx", ["get", key, "-f", ENV_FILE], { encoding: "utf8", shell: true }).trim();

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const envName = envIndex >= 0 ? args[envIndex + 1] : "production";
if (!["production", "development"].includes(envName))
    throw new Error(`--env must be production or development, got "${envName}"`);
const ENV_FILE = `.env.${envName}`;
const base64 = get("ERPG_KEYSTORE_BASE64");
const pass = get("ERPG_KEYSTORE_PASS");
const alias = get("ERPG_KEY_ALIAS");
if (!base64 || !pass || !alias) throw new Error(`ERPG_KEYSTORE_* is missing in ${ENV_FILE}`);

// SHA-1 / SHA-256 of the keystore via keytool (needs a JDK on PATH). null when keytool is not available.
const fingerprints = () => {
    const dir = mkdtempSync(join(tmpdir(), "erpg-ks-"));
    const file = join(dir, "release.keystore");
    try {
        writeFileSync(file, Buffer.from(base64, "base64"));
        const out = execFileSync(
            "keytool",
            ["-list", "-v", "-keystore", file, "-alias", alias, "-storepass", pass],
            { encoding: "utf8" }
        );
        const pick = (name) => out.match(new RegExp(name + ": *([0-9A-F:]+)"))?.[1] ?? null;
        return { sha1: pick("SHA1"), sha256: pick("SHA256") };
    } catch {
        return null;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
};

const fileIndex = args.indexOf("--file");
if (fileIndex >= 0) {
    writeFileSync(args[fileIndex + 1], Buffer.from(base64, "base64"));
    console.error(`written: ${args[fileIndex + 1]}`);
} else if (args.includes("--json")) {
    console.log(JSON.stringify({ base64, pass, alias, ...fingerprints() }));
} else if (args.includes("--sha1")) {
    const prints = fingerprints();
    if (!prints) throw new Error("keytool not found: install a JDK and put it on PATH");
    console.log(`SHA1: ${prints.sha1}
SHA256: ${prints.sha256}`);
} else {
    console.log(`$env:ERPG_KEYSTORE_BASE64 = "${base64}"`);
    console.log(`$env:ERPG_KEYSTORE_PASS = "${pass}"`);
    console.log(`$env:ERPG_KEY_ALIAS = "${alias}"`);
}
