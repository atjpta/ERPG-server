import { and, eq, ilike } from "drizzle-orm";
import { DateTime } from "luxon";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { BaseService } from "@/core/services/base.service.js";
import type {
    AdminBanUserBody,
    AdminListUsersQuery,
} from "@/modules/auth/admin/validators/admin.users.validator.js";
import { Users } from "@/modules/auth/entities/user.entity.js";
import { UserStatus } from "@/modules/auth/enums/user.enum.js";
import { UserSessionRepo } from "@/modules/auth/repositories/user-session.repository.js";
import { UserRepo } from "@/modules/auth/repositories/user.repository.js";
import { playerKickService } from "@/modules/auth/user/services/player-kick.service.js";
import { KickReason } from "@/modules/auth/enums/kick-reason.enum.js";

/** Bỏ `password` trước khi trả về cho admin. */
const omitPassword = <T extends { password?: string | null }>(user: T | null) => {
    if (!user) return null;
    const { password: _password, ...rest } = user;
    return rest;
};

export class AdminUsersService extends BaseService<typeof Users> {
    constructor() {
        super(UserRepo);
    }

    async list(query: AdminListUsersQuery) {
        const { search, status, ...pagination } = query;
        const where = and(
            search ? ilike(Users.email, `%${search}%`) : undefined,
            status ? eq(Users.status, status) : undefined
        );
        const result = await this.paginate({ pagination, where });
        return { ...result, items: result.items.map(omitPassword) };
    }

    async getDetail(id: string) {
        return omitPassword(await this.findById({ id }));
    }

    /** Ban user (chặn login) + đăng xuất khỏi mọi thiết bị ngay lập tức. */
    async ban(id: string, body: AdminBanUserBody) {
        const banExpiresAt = body.durationDays
            ? DateTime.now().plus({ days: body.durationDays }).toJSDate()
            : null;

        const user = await withTransaction(async (tx) => {
            const user = await UserRepo.updateById({
                id,
                data: { status: UserStatus.BANNED, banReason: body.reason ?? null, banExpiresAt },
                dbOrTx: tx,
            });
            if (!user) return null;
            await UserSessionRepo.revokeAllByUserId({ userId: id, dbOrTx: tx });
            return user;
        });
        if (user) playerKickService.kickUser(id, KickReason.BANNED);
        return omitPassword(user);
    }

    async unban(id: string) {
        const user = await UserRepo.updateById({
            id,
            data: { status: UserStatus.ACTIVE, banReason: null, banExpiresAt: null },
        });
        return omitPassword(user);
    }

    async forceLogout(id: string) {
        const user = await this.findById({ id });
        if (!user) return null;
        await UserSessionRepo.revokeAllByUserId({ userId: id });
        playerKickService.kickUser(id, KickReason.SESSION_REVOKED);
        return user;
    }

    async listSessions(id: string) {
        return UserSessionRepo.findActiveByUserId({ userId: id });
    }

    async revokeSession(userId: string, sessionId: string) {
        const session = await UserSessionRepo.findById({ id: sessionId });
        if (!session || session.userId !== userId) return null;
        const revoked = await UserSessionRepo.revoke({ id: sessionId });
        playerKickService.kickSession(userId, sessionId);
        return revoked;
    }
}

export const adminUsersService = new AdminUsersService();
