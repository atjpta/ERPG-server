import { DateTime } from "luxon";
import { Response } from "@/core/response/response.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { KickReason } from "@/core/enums/kick-reason.enum.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { playerKickService } from "@/core/services/player-kick.service.js";
import { UserStatus } from "@/modules/auth/enums/user.enum.js";
import { UserSessionRepo } from "@/modules/auth/repositories/user-session.repository.js";
import { UserRepo } from "@/modules/auth/repositories/user.repository.js";
import { omitPassword } from "@/modules/auth/utils/omit-password.util.js";

/** Admin chặn / đăng xuất user: ghi DB rồi đá user đang online. */
export class UserModerationService {
    /** Ban user (chặn login) + đăng xuất khỏi mọi thiết bị ngay lập tức. */
    async ban(params: {
        userId: string;
        reason?: string;
        durationDays?: number;
    }): Promise<Response<ReturnType<typeof omitPassword>>> {
        const { userId, reason, durationDays } = params;
        const banExpiresAt = durationDays
            ? DateTime.now().plus({ days: durationDays }).toJSDate()
            : null;

        const user = await withTransaction(async (tx) => {
            const updated = await UserRepo.updateById({
                id: userId,
                data: { status: UserStatus.BANNED, banReason: reason ?? null, banExpiresAt },
                dbOrTx: tx,
            });
            if (!updated) return null;
            await UserSessionRepo.revokeAllByUserId({ userId, dbOrTx: tx });
            return updated;
        });
        if (!user) return Response.error(CommonCode.NOT_FOUND);
        playerKickService.kickUser(userId, KickReason.BANNED);
        return Response.success(omitPassword(user));
    }

    /** Đăng xuất user khỏi mọi thiết bị. */
    async forceLogout(userId: string): Promise<Response<null>> {
        const user = await UserRepo.findById({ id: userId });
        if (!user) return Response.error(CommonCode.NOT_FOUND);
        await UserSessionRepo.revokeAllByUserId({ userId });
        playerKickService.kickUser(userId, KickReason.SESSION_REVOKED);
        return Response.success();
    }

    async revokeSession(params: { userId: string; sessionId: string }): Promise<Response<null>> {
        const { userId, sessionId } = params;
        const session = await UserSessionRepo.findById({ id: sessionId });
        if (!session || session.userId !== userId) return Response.error(CommonCode.NOT_FOUND);
        await UserSessionRepo.revoke({ id: sessionId });
        playerKickService.kickSession(userId, sessionId);
        return Response.success();
    }
}

export const userModerationService = new UserModerationService();
