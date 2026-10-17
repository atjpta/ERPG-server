import { PartyLootMode } from "@/modules/master-data/enums/party-loot-mode.enum.js";
import { z } from "zod";

/** Master data `party_config`. */
export const PartyConfigSchema = z.object({
    /** Số thành viên tối đa của party — cũng là sức chứa của mỗi instance dungeon. */
    maxMembers: z.number().int().min(1).max(4),
    /** Lời mời hết hạn sau chừng này giây. */
    inviteTtlSec: z.number().int().positive(),
    /** Mỗi người thêm (ngoài người đầu) cộng thêm bấy nhiêu phần trăm vào tổng exp chia (0.1 = +10%). */
    expBonusPerExtraMember: z.number().min(0),
    /**
     * Thành viên chỉ được chia thưởng nếu chênh level với quái không quá chừng này (chống kéo cày /
     * hưởng ké); người kết liễu luôn được tính. 0 = không giới hạn.
     */
    maxLevelGap: z.number().int().min(0).default(10),
    /** Chia vàng đều cho thành viên đủ điều kiện (phần dư về người kết liễu); tắt = người kết liễu giữ hết. */
    shareGold: z.boolean().default(true),
    /** Cách chia item mặc định của party mới. */
    lootMode: z.enum(PartyLootMode).default(PartyLootMode.ROUND_ROBIN),
});
export type PartyConfig = z.infer<typeof PartyConfigSchema>;
