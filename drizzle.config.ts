import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "postgresql",
    schema: "src/modules/**/entities/*.entity.ts",
    out: "src/migrations",
    dbCredentials: {
        url: process.env.POSTGRES_URI!,
    },
});
