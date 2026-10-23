import type { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { ItemReward } from "@/modules/rewards/types/reward.type.js";

/** Một thao tác nguyên tử trong `PlayerDataWorldService.apply`. */
export type PlayerChangeOp =
    /** Trừ `quantity` item theo code; không đủ thì cả lô thất bại, không đổi gì. */
    | { type: "takeItem"; itemCode: string; quantity: number }
    /** Cộng item vào túi; `requireFit` (quest, thoại: cả nhóm cùng thành công) thì không đủ chỗ là thất bại, không thì phần dư bị mất. */
    | { type: "giveItem"; items: ItemReward[]; source?: ItemSource; requireFit?: boolean }
    /** Cộng điểm tiềm năng / kỹ năng (lên level). */
    | { type: "addPoints"; attributePoints: number; skillPoints: number };
