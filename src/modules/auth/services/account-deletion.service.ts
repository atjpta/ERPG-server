import { DateTime } from "luxon";
import { Response } from "@/core/response/response.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { AuthErrorCode } from "@/modules/auth/enums/auth-error-code.enum.js";
import type { AccountDeletionRequest } from "@/modules/auth/entities/account-deletion-request.entity.js";
import type { Queryable } from "@/configs/postgres.config.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import {
    AccountDeletionSource,
    AccountDeletionStatus,
} from "@/modules/auth/enums/account-deletion.enum.js";
import { UserStatus } from "@/modules/auth/enums/user.enum.js";
import { AccountDeletionRequestRepo } from "@/modules/auth/repositories/account-deletion-request.repository.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { UserOauthAccountRepo } from "@/modules/auth/repositories/user-oauth-account.repository.js";
import { UserSessionRepo } from "@/modules/auth/repositories/user-session.repository.js";
import { UserRepo } from "@/modules/auth/repositories/user.repository.js";
import type { AccountDeletionRequestInput } from "@/modules/auth/types/account-deletion.type.js";
import { playerKickService } from "@/core/services/player-kick.service.js";
import { KickReason } from "@/core/enums/kick-reason.enum.js";

/**
 * Xoá tài khoản theo chính sách Google Play (https://support.google.com/googleplay/android-developer/answer/13327111):
 * - Trong app: người chơi tự xoá → xử lý ngay (`deleteMyAccount`).
 * - Qua web (link khai báo trên Play Console): gửi yêu cầu → admin xác minh rồi xử lý.
 *
 * Xoá = xoá toàn bộ dữ liệu game (player...) + liên kết Google/Play Games + session, và ẩn danh
 * bản ghi `users` (giữ id cho nhật ký/khoá ngoại). Đăng nhập lại bằng Google sẽ ra tài khoản mới.
 * Thêm bảng dữ liệu người chơi mới → nhớ xoá ở `purgeUserData`.
 */
export class AccountDeletionService {
    async deleteMyAccount(userId: string, reason?: string) {
        const request = await withTransaction(async (tx) => {
            await this.purgeUserData(userId, tx);
            return AccountDeletionRequestRepo.create({
                data: {
                    userId,
                    reason: reason ?? null,
                    source: AccountDeletionSource.APP,
                    status: AccountDeletionStatus.COMPLETED,
                    processedAt: DateTime.now().toJSDate(),
                },
                dbOrTx: tx,
            });
        });
        playerKickService.kickUser(userId, KickReason.ACCOUNT_DELETED);
        return request;
    }

    /**
     * Yêu cầu từ trang web — không xác thực được người gửi nên chỉ ghi nhận, admin xác minh sau.
     * Không tiết lộ email có tồn tại hay không (luôn trả cùng 1 kết quả).
     */
    async submitWebRequest(body: AccountDeletionRequestInput) {
        const user = body.contactEmail
            ? await UserRepo.findByEmail({ email: body.contactEmail })
            : null;
        await AccountDeletionRequestRepo.create({
            data: {
                userId: user?.id ?? null,
                contactEmail: body.contactEmail ?? null,
                playerName: body.playerName ?? null,
                reason: body.reason ?? null,
                source: AccountDeletionSource.WEB,
            },
        });
    }

    /** Admin đã xác minh người gửi là chủ tài khoản → xoá dữ liệu và đóng yêu cầu. */
    async completeRequest(params: {
        id: string;
        adminId: string;
        userId?: string;
        note?: string;
    }): Promise<Response<AccountDeletionRequest>> {
        const { id, adminId, note } = params;
        const result = await withTransaction(
            async (tx): Promise<Response<AccountDeletionRequest>> => {
                const pending = await this.checkPending(id, tx);
                if (Response.isError(pending)) return pending;
                const userId = params.userId ?? pending.data.userId;
                // Yêu cầu chưa khớp tài khoản nào: admin phải chỉ định `userId`.
                if (!userId) return Response.error(CommonCode.INVALID_INPUT);

                await this.purgeUserData(userId, tx);
                const request = await AccountDeletionRequestRepo.updateById({
                    id,
                    data: {
                        userId,
                        status: AccountDeletionStatus.COMPLETED,
                        processedAt: DateTime.now().toJSDate(),
                        processedByAdminId: adminId,
                        adminNote: note ?? null,
                    },
                    dbOrTx: tx,
                });
                return Response.success(request);
            }
        );
        if (!Response.isError(result) && result.data?.userId) {
            playerKickService.kickUser(result.data.userId, KickReason.ACCOUNT_DELETED);
        }
        return result;
    }

    /** Không xác minh được chủ tài khoản (vd thông tin không khớp). */
    async rejectRequest(params: {
        id: string;
        adminId: string;
        note: string;
    }): Promise<Response<AccountDeletionRequest>> {
        const { id, adminId, note } = params;
        const pending = await this.checkPending(id);
        if (Response.isError(pending)) return pending;
        const request = await AccountDeletionRequestRepo.updateById({
            id,
            data: {
                status: AccountDeletionStatus.REJECTED,
                processedAt: DateTime.now().toJSDate(),
                processedByAdminId: adminId,
                adminNote: note,
            },
        });
        return Response.success(request);
    }

    private async checkPending(
        id: string,
        dbOrTx?: Queryable
    ): Promise<Response<AccountDeletionRequest>> {
        const request = await AccountDeletionRequestRepo.findByIdOrFail({
            id,
            dbOrTx,
            code: AuthErrorCode.ACCOUNT_DELETION_REQUEST_NOT_FOUND,
        });
        if (request.status !== AccountDeletionStatus.PENDING) {
            return Response.error(AuthErrorCode.ACCOUNT_DELETION_REQUEST_PROCESSED);
        }
        return Response.success(request);
    }

    /** Xoá dữ liệu của 1 user — gọi trong transaction của caller. Idempotent. */
    async purgeUserData(userId: string, dbOrTx: Queryable) {
        const user = await UserRepo.findByIdOrFail({ id: userId, dbOrTx });
        if (user.status === UserStatus.DELETED) return user;

        await UserSessionRepo.revokeAllByUserId({ userId, dbOrTx });
        await UserOauthAccountRepo.deleteByUserId({ userId, dbOrTx });
        // Xoá player kéo theo friendships / player_blocks / mails (FK onDelete cascade; người gửi bị xoá chỉ mất liên kết).
        await PlayerIdentityRepo.deleteByUserId({ userId, dbOrTx });
        return UserRepo.updateByIdOrFail({
            id: userId,
            data: {
                email: `deleted_${userId}@deleted.local`,
                password: null,
                status: UserStatus.DELETED,
                banReason: null,
                banExpiresAt: null,
                deletedAt: DateTime.now().toJSDate(),
            },
            dbOrTx,
        });
    }
}

export const accountDeletionService = new AccountDeletionService();
