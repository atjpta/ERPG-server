import jwt from "jsonwebtoken";
import { env } from "@/configs/env.config.js";
import { AdminStatus } from "@/modules/auth/enums/admin.enum.js";
import { AdminRepo } from "@/modules/auth/repositories/admin.repository.js";
import type { AuthAdmin } from "@/modules/auth/types/auth-user.type.js";
export class AdminSessionService {
    verifyToken(token: string): AuthAdmin {
        const payload = jwt.verify(token, env.ADMIN_JWT_SECRET) as AuthAdmin;
        if (payload.typ !== "admin") throw new Error("Invalid token type");
        return payload;
    }

    async getActiveById(id: string) {
        const admin = await AdminRepo.findById({ id });
        if (!admin || admin.status !== AdminStatus.ACTIVE) return null;
        return admin;
    }
}

export const adminSessionService = new AdminSessionService();
