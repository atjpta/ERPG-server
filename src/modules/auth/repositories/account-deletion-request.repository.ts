import { BaseRepository } from "@/core/repositories/base.repository.js";
import { AccountDeletionRequests } from "@/modules/auth/entities/account-deletion-request.entity.js";

export class AccountDeletionRequestRepository extends BaseRepository<
    typeof AccountDeletionRequests
> {
    constructor() {
        super(AccountDeletionRequests);
    }
}

export const AccountDeletionRequestRepo = new AccountDeletionRequestRepository();
