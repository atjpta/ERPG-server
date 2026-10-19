// Creates the PostgreSQL database named in POSTGRES_URI when it does not exist yet (first-time setup).
// Run through dotenvx so the encrypted .env file is loaded:  yarn db:create   |   yarn db:check (only reports).
// Needs a reachable PostgreSQL server and a role allowed to CREATE DATABASE.
import postgres from 'postgres';

const uri = process.env.POSTGRES_URI;
if (!uri) throw new Error('POSTGRES_URI is missing (is the dotenvx private key set? see .env.keys)');

const url = new URL(uri);
const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
if (!name) throw new Error('POSTGRES_URI has no database name');
const checkOnly = process.argv.includes('--check');

// Connect to the maintenance database "postgres" with the same credentials.
const adminUrl = new URL(uri);
adminUrl.pathname = '/postgres';
const admin = postgres(adminUrl.toString(), { max: 1, connect_timeout: 10, onnotice: () => {} });

try {
    const [row] = await admin`select 1 as ok from pg_database where datname = ${name}`;
    if (row) {
        console.log(`database "${name}" exists on ${url.host}`);
    } else if (checkOnly) {
        console.log(`database "${name}" is MISSING on ${url.host} (run: yarn db:create)`);
        process.exitCode = 2;
    } else {
        await admin`create database ${admin(name)}`;
        console.log(`database "${name}" created on ${url.host}`);
    }
} catch (error) {
    console.error(`cannot reach PostgreSQL at ${url.host}: ${error.message}`);
    process.exitCode = 1;
} finally {
    await admin.end();
}
