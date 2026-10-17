/** Information used to locate an account when its owner requests deletion through the public form. */
export interface AccountDeletionRequestInput {
    contactEmail?: string;
    playerName?: string;
    reason?: string;
}
