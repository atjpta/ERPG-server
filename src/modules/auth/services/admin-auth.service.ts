import bcrypt from "bcryptjs";
import { Response } from "@/core/response/response.js";
import jwt from "jsonwebtoken";
import { env } from "@/configs/env.config.js";
import { assertRateLimit } from "@/core/utils/rate-limit.util.js";
import { ADMIN_LOGIN_EMAIL_RATE_LIMIT } from "@/modules/auth/constants/rate-limit.constant.js";
import { AdminStatus } from "@/modules/auth/enums/admin.enum.js";
import { AuthErrorCode } from "@/modules/auth/enums/auth-error-code.enum.js";
import { AdminRepo } from "@/modules/auth/repositories/admin.repository.js";
import type { AuthAdmin } from "@/modules/auth/types/auth-user.type.js";

const ADMIN_TOKEN_EXPIRES_IN = "7d";

export class AdminAuthService {
    async login(params: { email: string; password: string }): Promise<Response<{ token: string }>> {
        const { email, password } = params;
        await assertRateLimit(ADMIN_LOGIN_EMAIL_RATE_LIMIT, email);
        const admin = await AdminRepo.findByEmail({ email });
        const valid =
            !!admin &&
            admin.status === AdminStatus.ACTIVE &&
            (await bcrypt.compare(password, admin.password));
        if (!valid) return Response.error(AuthErrorCode.ADMIN_INVALID_CREDENTIALS);

        const payload: Pick<AuthAdmin, "typ" | "adminId" | "role"> = {
            typ: "admin",
            adminId: admin.id,
            role: admin.role,
        };
        const token = jwt.sign(payload, env.ADMIN_JWT_SECRET, {
            expiresIn: ADMIN_TOKEN_EXPIRES_IN,
        });
        return Response.success({ token });
    }
}

export const adminAuthService = new AdminAuthService();
