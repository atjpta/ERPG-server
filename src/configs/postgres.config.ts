import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/configs/env.config.js";

const queryClient = postgres(env.POSTGRES_URI);

export const db = drizzle(queryClient);

export type Database = typeof db;
export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Queryable = Database | DbTransaction;

export async function connectPostgres() {
    try {
        await queryClient`select 1`;
        console.info(`[PostgreSQL] Connected: ${new URL(env.POSTGRES_URI).host}`);
    } catch (err) {
        console.error("[PostgreSQL] Connection failed:", err);
        process.exit(1);
    }
}
