// Drops the PostgreSQL database named in POSTGRES_URI (dev reset). DESTROYS ALL ITS DATA.
// Run through dotenvx so the encrypted .env file is loaded:  yarn db:drop
// Safety: refuses when NODE_ENV is production or the server is not local, unless --remote is passed.
// Does nothing when the database does not exist. Open connections are terminated (DROP ... WITH FORCE).
import postgres from 'postgres';

const uri = process.env.POSTGRES_URI;
if (!uri) throw new Error('POSTGRES_URI is missing (is the dotenvx private key set? see .env.keys)');

const url = new URL(uri);
const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
if (!name || name === 'postgres') throw new Error(`refusing to drop database "${name}"`);

const isLocal = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
if (process.env.NODE_ENV === 'production') {
    console.error('refusing to drop: NODE_ENV is production');
    process.exit(1);
}
if (!isLocal && !process.argv.includes('--remote')) {
    console.error(`refusing to drop "${name}" on remote host ${url.host} (pass --remote if you really mean it)`);
    process.exit(1);
}

const adminUrl = new URL(uri);
adminUrl.pathname = '/postgres';
const admin = postgres(adminUrl.toString(), { max: 1, connect_timeout: 10, onnotice: () => {} });

try {
    const [row] = await admin`select 1 as ok from pg_database where datname = ${name}`;
    if (!row) {
        console.log(`database "${name}" does not exist on ${url.host}, nothing to drop`);
    } else {
        await admin`drop database ${admin(name)} with (force)`;
        console.log(`database "${name}" dropped on ${url.host}`);
    }
} catch (error) {
    console.error(`cannot drop "${name}" on ${url.host}: ${error.message}`);
    process.exitCode = 1;
} finally {
    await admin.end();
}
