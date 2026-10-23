import type { ErrorCode, Result } from "@/core/types/result.type.js";
import type { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { Equipments, Inventories } from "@/modules/player/schemas/inventory.schema.js";
import type { Attributes } from "@/modules/player/schemas/stat.schema.js";
import type { CurrencyReward, ItemReward } from "@/modules/rewards/types/reward.type.js";
import type {
    PlayerGlobalFields,
    PlayerWorldFields,
} from "@/modules/player/types/player-fields.type.js";

/**
 * Phần PlayerData do global làm chủ, gửi sang world để world giữ bản sao chỉ-đọc (replica). Stats dẫn xuất
 * (attributes, stats, maxHp...) không gửi: world tính lại bằng `playerStatService.compute` từ chính các trường này.
 */
export interface PlayerDataSnapshot {
    /** Revision của cả bản ghi `player_states` ở thời điểm snapshot (xem `PlayerDataState.revision`). */
    revision: number;
    attributePoints: number;
    skillPoints: number;
    allocatedAttributes: Attributes;
    equipments: Equipments;
    inventories: Inventories;
}

/** Một thao tác nguyên tử trong `ApplyPlayerChangesGlobalCommand`. */
export type PlayerChangeOp =
    /** Trừ `quantity` item theo code; không đủ thì cả entry thất bại, không đổi gì. */
    | { type: "takeItem"; itemCode: string; quantity: number }
    /** Cộng item vào túi; `requireFit` (quest, thoại: cả nhóm cùng thành công) thì không đủ chỗ là thất bại, không thì phần dư bị mất. */
    | { type: "giveItem"; items: ItemReward[]; source?: ItemSource; requireFit?: boolean }
    /** Cộng điểm tiềm năng / kỹ năng (lên level ở world). */
    | { type: "addPoints"; attributePoints: number; skillPoints: number };

/** Một lô thao tác của một player; `eventId` để global bỏ qua nếu world gửi lại. */
export interface PlayerChangeEntry {
    eventId: string;
    playerId: string;
    ops: PlayerChangeOp[];
}

/** Kết quả một entry của `ApplyPlayerChangesGlobalCommand`. */
export interface PlayerChangeEntryResult {
    eventId: string;
    result: Result<{ revision: number }>;
}

/** Backup một player từ world (`SyncPlayersGlobalCommand`). */
export interface PlayerSyncEntry {
    playerId: string;
    /** Revision world đang biết; cũ hơn bản của global thì global trả kèm `data` ("cập nhật ngược lại"). */
    baseRevision: number;
    world: PlayerWorldFields;
}

export interface PlayerSyncEntryResult {
    playerId: string;
    /** Revision sau khi lưu; `undefined` + `code` khi lưu lỗi. */
    revision?: number;
    code?: ErrorCode;
    data?: PlayerDataSnapshot;
}

/** Thao tác trừ / hoàn ví do global nhờ world áp dụng (ví do world làm chủ). */
export interface WalletChange {
    eventId: string;
    playerId: string;
    currencies: CurrencyReward[];
}

/**
 * Phần của world mà thao tác của global cần đọc (level để mặc đồ, ví để trả phí). Lấy trực tiếp từ world mỗi lần cần
 * (`PullPlayerFieldsWorldCommand`), global không giữ bản sao.
 */
export type PlayerWorldView = Pick<PlayerWorldFields, "level" | "wallet">;

/** Dữ liệu dựng `PlayerDataState`. */
export interface PlayerDataInit {
    playerId: string;
    name: string;
    classId: string;
    revision: number;
    global: PlayerGlobalFields;
}
