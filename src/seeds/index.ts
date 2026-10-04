import { connectPostgres } from "@/configs/postgres.config.js";
import { AdminSeed } from "@/modules/auth/seeds/admin.seed.js";
import { GameServerSeed } from "@/modules/auth/seeds/game-server.seed.js";
import { GameMapSeed } from "@/modules/maps/seeds/game-map.seed.js";
import { MasterDataSeed } from "@/modules/master-data/seeds/master-data.seed.js";
import { MonsterSeed } from "@/modules/monsters/seeds/monster.seed.js";
import { PlayerSkillSeed } from "@/modules/player/seeds/player-skill.seed.js";
import { SkillSeed } from "@/modules/skills/seeds/skill.seed.js";

const force = process.argv.includes("--force");

await connectPostgres();
await MasterDataSeed(force);
await AdminSeed(force);
await GameServerSeed(force);
await GameMapSeed(force);
// Skill trước: monster/player tham chiếu skill theo id.
await SkillSeed();
await MonsterSeed();
await PlayerSkillSeed();

process.exit(0);
