import { and, eq, ilike, or } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Queryable } from "@/configs/postgres.config.js";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { BaseService } from "@/core/services/base.service.js";
import { serviceError } from "@/core/utils/service-error.js";
import type {
    AdminCompleteAccountDeletionBody,
    AdminListAccountDeletionQuery,
    AdminRejectAccountDeletionBody,
} from "@/modules/auth/admin/validators/admin.account-deletion.validator.js";
import { AccountDeletionRequests } from "@/modules/auth/entities/account-deletion-request.entity.js";
import { AccountDeletionStatus } from "@/modules/auth/enums/account-deletion.enum.js";
import { AccountDeletionRequestRepo } from "@/modules/auth/repositories/account-deletion-request.repository.js";
import { accountDeletionService } from "@/modules/auth/user/services/account-deletion.service.js";
import { playerKickService } from "@/modules/auth/user/services/player-kick.service.js";
import { KickReason } from "@/modules/auth/enums/kick-reason.enum.js";

export class AdminAccountDeletionService extends BaseService<typeof AccountDeletionRequests> {
    constructor() {
        super(AccountDeletionRequestRepo);
    }

    async list(query: AdminListAccountDeletionQuery) {
        const { search, status, source, page, limit } = query;
        const where = and(
            search
                ? or(
                      ilike(AccountDeletionRequests.contactEmail, `%${search}%`),
                      ilike(AccountDeletionRequests.playerName, `%${search}%`)
                  )
                : undefined,
            status ? eq(AccountDeletionRequests.status, status) : undefined,
            source ? eq(AccountDeletionRequests.source, source) : undefined
        );
        return this.paginate({ pagination: { page, limit }, where });
    }

    /** Admin đã xác minh người gửi là chủ tài khoản → xoá dữ liệu và đóng yêu cầu. */
    async complete(id: string, adminId: string, body: AdminCompleteAccountDeletionBody) {
        const request = await withTransaction(async (tx) => {
            const request = await this.getPendingOrFail(id, tx);
            const userId = body.userId ?? request.userId;
            if (!userId) {
                serviceError(
                    "userId is required — request is not matched to any account",
                    400,
                    ResponseCode.INVALID_INPUT
                );
            }

            await accountDeletionService.purgeUserData(userId, tx);
            return AccountDeletionRequestRepo.updateById({
                id,
                data: {
                    userId,
                    status: AccountDeletionStatus.COMPLETED,
                    processedAt: DateTime.now().toJSDate(),
                    processedByAdminId: adminId,
                    adminNote: body.note ?? null,
                },
                dbOrTx: tx,
            });
        });
        if (request?.userId) {
            playerKickService.kickUser(request.userId, KickReason.ACCOUNT_DELETED);
        }
        return request;
    }

    /** Không xác minh được chủ tài khoản (vd thông tin không khớp). */
    async reject(id: string, adminId: string, body: AdminRejectAccountDeletionBody) {
        await this.getPendingOrFail(id);
        return AccountDeletionRequestRepo.updateById({
            id,
            data: {
                status: AccountDeletionStatus.REJECTED,
                processedAt: DateTime.now().toJSDate(),
                processedByAdminId: adminId,
                adminNote: body.note,
            },
        });
    }

    private async getPendingOrFail(id: string, dbOrTx?: Queryable) {
        const request = await AccountDeletionRequestRepo.findByIdOrFail({
            id,
            dbOrTx,
            message: "Account deletion request not found",
            code: ResponseCode.ACCOUNT_DELETION_REQUEST_NOT_FOUND,
        });
        if (request.status !== AccountDeletionStatus.PENDING) {
            serviceError(
                "Account deletion request is already processed",
                409,
                ResponseCode.ACCOUNT_DELETION_REQUEST_PROCESSED
            );
        }
        return request;
    }
}

export const adminAccountDeletionService = new AdminAccountDeletionService();
