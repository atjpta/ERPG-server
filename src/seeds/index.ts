import { connectPostgres } from "@/configs/postgres.config.js";
import { AdminSeed } from "@/modules/auth/seeds/admin.seed.js";
import { GameServerSeed } from "@/modules/auth/seeds/game-server.seed.js";
import { GameMapSeed } from "@/modules/maps/seeds/game-map.seed.js";
import { MasterDataSeed } from "@/modules/master-data/seeds/master-data.seed.js";
import { MonsterSeed } from "@/modules/monsters/seeds/monster.seed.js";
import { ClassSeed } from "@/modules/classes/seeds/class.seed.js";
import { ItemSeed } from "@/modules/items/seeds/item.seed.js";
import { ContentRefsCheck } from "@/seeds/content-refs.seed.js";
import { DialogueSeed } from "@/modules/dialogues/seeds/dialogue.seed.js";
import { NpcSeed } from "@/modules/npcs/seeds/npc.seed.js";
import { QuestSeed } from "@/modules/quests/seeds/quest.seed.js";
import { SkillSeed } from "@/modules/skills/seeds/skill.seed.js";

const force = process.argv.includes("--force");

await connectPostgres();
await MasterDataSeed();
await AdminSeed(force);
await GameServerSeed(force);
await GameMapSeed();
await SkillSeed();
await ItemSeed();
await ClassSeed();
await MonsterSeed();
await DialogueSeed();
await NpcSeed();
await QuestSeed();
await ContentRefsCheck();

process.exit(0);
