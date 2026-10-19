export enum PlayerStatus {
    ACTIVE = "active",
    BANNED = "banned",
    /** Soft-deleted by the owner: hidden from the character list, frees the slot and the name. */
    DELETED = "deleted",
}
