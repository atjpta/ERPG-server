import type { NewQuest } from "@/modules/quests/entities/quest.entity.js";
import { STORY_QUESTS } from "@/modules/quests/seeds/quest-content.js";

/** Quest cốt truyện (hero) + phụ (side). Quest hằng ngày sinh động theo từng player, không seed ở đây. */
export const QUESTS: NewQuest[] = STORY_QUESTS;
