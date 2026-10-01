/** Run with the local server running and database migrated/seeded: yarn test:tokens. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const serverUrl = (process.env.SERVER_URL ?? "http://localhost:2567").replace(/\/$/, "");
const password = process.env.TEST_USER_PASSWORD ?? "123456";
const emails = ["test1@erpg.local", "test2@erpg.local"];
const outputFile = join(process.cwd(), "generated", "local-test-tokens.json");

function parseAuthResult(value, email) {
    if (!value || typeof value !== "object") {
        throw new Error(`${email}: server response has no data object`);
    }
    const { token, playerToken, userId, player } = value;
    if (
        typeof token !== "string" ||
        typeof playerToken !== "string" ||
        typeof userId !== "string" ||
        !player ||
        typeof player.id !== "string" ||
        typeof player.name !== "string" ||
        typeof player.serverId !== "string" ||
        typeof player.mapCode !== "string"
    ) {
        throw new Error(`${email}: auth response is missing token or player data`);
    }
    return { email, token, playerToken, userId, player };
}

async function authenticate(email) {
    const body = JSON.stringify({
        email,
        password,
        platform: "pc",
        clientVersion: "0.0.1",
        device: `local-test-${email}`,
    });

    // Registration already issues both tokens. Only log in if the account exists.
    for (const action of ["register", "login"]) {
        const response = await fetch(`${serverUrl}/auth/${action}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            signal: AbortSignal.timeout(15_000),
        });
        const payload = await response.json();

        if (
            action === "register" &&
            response.status === 409 &&
            payload?.code === "AUTH_EMAIL_EXISTS"
        ) {
            continue;
        }
        if (!response.ok) {
            throw new Error(
                `${email}: POST /auth/${action} -> ${response.status} ` +
                    `${payload?.code ?? ""} ${payload?.message ?? response.statusText}`
            );
        }
        return parseAuthResult(payload?.data, email);
    }
    throw new Error(`Could not authenticate ${email}`);
}

try {
    const users = [];
    for (const email of emails) users.push(await authenticate(email));

    const json = JSON.stringify({ serverUrl, generatedAt: new Date().toISOString(), users }, null, 2);
    await mkdir(join(process.cwd(), "generated"), { recursive: true });
    await writeFile(outputFile, `${json}\n`, { mode: 0o600 });
    console.info(json);
    console.error(`Saved tokens to ${outputFile}`);
    console.error("Use playerToken for Colyseus rooms and /players; token for /auth.");
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`Check that ${serverUrl} is running and the database is migrated and seeded.`);
    process.exitCode = 1;
}
