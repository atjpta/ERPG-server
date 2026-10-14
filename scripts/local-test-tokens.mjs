/** Run with the local server running and database migrated/seeded: yarn test:tokens. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const serverUrl = (process.env.SERVER_URL ?? "http://localhost:2567").replace(/\/$/, "");
const password = process.env.TEST_USER_PASSWORD ?? "123456";
const outputFile = join(process.cwd(), "generated", "local-test-tokens.json");

/** Mỗi class khởi đầu một tài khoản: `test-<classCode>@erpg.local`. */
const classCodes = ["swordsman", "archer", "cleric"];
const accounts = classCodes.map((classCode) => ({
    email: `test-${classCode}@erpg.local`,
    classCode,
}));

/** Tài khoản mới chưa có nhân vật (`player`/`playerToken` = null): tạo 1 nhân vật bằng user token. */
async function ensurePlayer(email, classCode, value) {
    if (value?.player && value?.playerToken) return value;
    const headers = { "content-type": "application/json", authorization: `Bearer ${value.token}` };
    const nameResponse = await fetch(`${serverUrl}/players/random-name`, {
        headers,
        signal: AbortSignal.timeout(15_000),
    });
    const name = (await nameResponse.json())?.data?.name;
    const response = await fetch(`${serverUrl}/players`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name, classCode }),
        signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json();
    if (!response.ok) {
        throw new Error(
            `${email}: POST /players -> ${response.status} ${payload?.code ?? ""} ${payload?.message ?? response.statusText}`
        );
    }
    return { ...value, ...payload.data };
}

function parseAuthResult(value, email, classCode) {
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
    return { email, classCode, token, playerToken, userId, player };
}

async function authenticate({ email, classCode }) {
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
        return parseAuthResult(
            await ensurePlayer(email, classCode, payload?.data),
            email,
            classCode
        );
    }
    throw new Error(`Could not authenticate ${email}`);
}

try {
    const users = [];
    for (const account of accounts) users.push(await authenticate(account));

    const json = JSON.stringify(
        { serverUrl, generatedAt: new Date().toISOString(), users },
        null,
        2
    );
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
