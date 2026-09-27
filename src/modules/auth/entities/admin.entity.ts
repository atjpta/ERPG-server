import { pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { AdminRole, AdminStatus } from "@/modules/auth/enums/admin.enum.js";

export const adminRoleEnum = pgEnum("admin_role", AdminRole);
export const adminStatusEnum = pgEnum("admin_status", AdminStatus);

export const Admins = pgTable("admins", {
    ...baseColumns(),
    email: text("email").notNull().unique(),
    password: text("password").notNull(),
    name: text("name").notNull().default(""),
    role: adminRoleEnum("role").notNull().default(AdminRole.ADMIN),
    status: adminStatusEnum("status").notNull().default(AdminStatus.ACTIVE),
});

export type Admin = typeof Admins.$inferSelect;
export type NewAdmin = typeof Admins.$inferInsert;
