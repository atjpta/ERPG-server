import type { ConditionContext } from "@/modules/dialogues/services/condition.service.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { QuestState } from "@/modules/quests/enums/quest.enum.js";
import { questProgressService } from "@/modules/quests/services/quest-progress.service.js";
import { questOf } from "@/rooms/world/modules/content/utils/quest-resolve.world.util.js";
import { inventoryWorldService } from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Dùng chung cho thoại / quest / vật thể: dựng ngữ cảnh điều kiện và đo khoảng cách. */
export class ContentWorldService {
    itemCount(player: PlayerWorldState, itemCode: string): number {
        return inventoryWorldService.countByCode(player, itemCode);
    }

    questState(player: PlayerWorldState, questCode: string): QuestState {
        const quest = questOf(player, questCode);
        if (!quest) return QuestState.NOT_STARTED;
        return questProgressService.questStateOf(quest, player.quests[questCode], (code) =>
            this.itemCount(player, code)
        );
    }

    conditionContext(room: WorldRoom, player: PlayerWorldState): ConditionContext {
        return {
            level: player.level,
            classCode: player.classCode,
            baseClassCode: player.baseClassCode,
            mapCode: room.map.code,
            flags: player.flags,
            questState: (code) => this.questState(player, code),
            itemCount: (code) => this.itemCount(player, code),
            currency: (code) =>
                (player.wallet as unknown as Record<string, { balance: number } | undefined>)[code]
                    ?.balance ?? 0,
        };
    }

    isNear(player: PlayerWorldState, x: number, y: number, radius: number): boolean {
        return Math.hypot(player.x - x, player.y - y) <= radius;
    }

    itemId(itemCode: string): string | undefined {
        return itemService.getByCode(itemCode)?.id;
    }
}

export const contentWorldService = new ContentWorldService();
