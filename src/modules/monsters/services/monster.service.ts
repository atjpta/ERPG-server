import type { Queryable } from "@/configs/postgres.config.js";
import { MonsterRepo } from "@/modules/monsters/repositories/monster.repository.js";

export class MonsterService {
    async getByCode(code: string, dbOrTx?: Queryable) {
        const monster = await MonsterRepo.findByCode({ code, dbOrTx });
        return monster;
    }
}

export const monsterService = new MonsterService();
