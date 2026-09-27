import bcrypt from "bcryptjs";
import { Admins } from "@/modules/auth/entities/admin.entity.js";
import { AdminRole } from "@/modules/auth/enums/admin.enum.js";
import { AdminRepo } from "@/modules/auth/repositories/admin.repository.js";

const DEFAULT_EMAIL = "admin@gmail.com";
const DEFAULT_PASSWORD = "123456";

export const AdminSeed = async (force = false) => {
    const hashed = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    await AdminRepo.upsert({
        data: {
            email: DEFAULT_EMAIL,
            password: hashed,
            name: "Super Admin",
            role: AdminRole.SUPER_ADMIN,
        },
        target: Admins.email,
        matchValue: DEFAULT_EMAIL,
        updateData: force ? { password: hashed } : undefined,
    });

    console.info("✅ [AdminSeed] Done");
};
