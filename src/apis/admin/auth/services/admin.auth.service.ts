import { AuthErrorCode } from "@/modules/auth/enums/auth-error-code.enum.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "@/configs/env.config.js";
import { assertRateLimit } from "@/core/utils/rate-limit.util.js";
import { serviceError } from "@/core/utils/service-error.js";
import type { AdminLoginBody } from "@/apis/admin/auth/validators/admin.auth.validator.js";
import { ADMIN_LOGIN_EMAIL_RATE_LIMIT } from "@/modules/auth/constants/rate-limit.constant.js";
import { AdminStatus } from "@/modules/auth/enums/admin.enum.js";
import { AdminRepo } from "@/modules/auth/repositories/admin.repository.js";
import type { AuthAdmin } from "@/modules/auth/types/auth-user.type.js";

const ADMIN_TOKEN_EXPIRES_IN = "7d";

export class AdminAuthService {
    async login({ email, password }: AdminLoginBody) {
        await assertRateLimit(ADMIN_LOGIN_EMAIL_RATE_LIMIT, email);
        const admin = await AdminRepo.findByEmail({ email });
        const valid =
            !!admin &&
            admin.status === AdminStatus.ACTIVE &&
            (await bcrypt.compare(password, admin.password));
        if (!valid) {
            serviceError("Invalid credentials", 400, AuthErrorCode.ADMIN_INVALID_CREDENTIALS);
        }

        const payload: Pick<AuthAdmin, "typ" | "adminId" | "role"> = {
            typ: "admin",
            adminId: admin.id,
            role: admin.role,
        };
        const token = jwt.sign(payload, env.ADMIN_JWT_SECRET, {
            expiresIn: ADMIN_TOKEN_EXPIRES_IN,
        });
        return { token };
    }

    async getProfile(id: string) {
        const admin = await AdminRepo.findById({ id });
        if (!admin) return null;
        const { password: _password, ...profile } = admin;
        return profile;
    }
}

export const adminAuthService = new AdminAuthService();
