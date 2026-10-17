import type { Quest } from "@/modules/quests/entities/quest.entity.js";
import { questService } from "@/modules/quests/services/quest.service.js";
import { dailyQuestToQuest } from "@/modules/quests/services/daily-quest.service.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";

/** Quest theo code của riêng player: quest trong DB, hoặc quest hằng ngày đã sinh cho player này. */
export const questOf = (player: PlayerWorldState, code: string): Quest | undefined => {
    const quest = questService.getByCode(code);
    if (quest) return quest;
    const def = player.dailyQuests?.quests.find((daily) => daily.code === code);
    return def ? dailyQuestToQuest(def) : undefined;
};

/** Mọi quest player có thể thấy: quest DB + quest hằng ngày của hôm nay. */
export const questsOf = (player: PlayerWorldState): Quest[] => [
    ...questService.list(),
    ...(player.dailyQuests?.quests ?? []).map((def) => dailyQuestToQuest(def)),
];
