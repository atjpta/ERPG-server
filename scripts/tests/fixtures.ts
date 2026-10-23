import { eq, inArray } from "drizzle-orm";
import { setCacheDataApp } from "@/cache-data/index.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { connectPostgres, db } from "@/configs/postgres.config.js";
import { generateEntityId } from "@/core/entities/base.entity.js";
import { GameMaps } from "@/modules/maps/entities/game-map.entity.js";
import { PlayerStates } from "@/modules/player/entities/player-state.entity.js";
import { GameServers } from "@/modules/auth/entities/game-server.entity.js";
import { Players } from "@/modules/auth/entities/player.entity.js";
import { Users } from "@/modules/auth/entities/user.entity.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import type { MasterDataValueMap } from "@/modules/master-data/schemas/master-data-value.schema.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";

export interface TestPlayer {
    id: string;
    userId: string;
    serverId: string;
    name: string;
}

/** Kết nối DB và nạp master data (đủ cho các service friend / mail; không cần dựng cả server). */
export async function bootstrap() {
    await connectPostgres();
    await setCacheDataApp();
}

/** Ghi đè một phần master data trong cache của tiến trình test (không ghi DB). */
export function patchMasterData<K extends MasterDataKey>(
    key: K,
    patch: Partial<MasterDataValueMap[K]>
) {
    const values = (masterDataCacheService as unknown as { values: Map<MasterDataKey, unknown> })
        .values;
    values.set(key, { ...masterDataCacheService.get(key), ...patch });
}

/** Tạo `count` user + player tạm trên game server đầu tiên (không cần player_states). Nhớ `removePlayers` sau khi xong. */
export async function createPlayers(count: number, tag: string): Promise<TestPlayer[]> {
    const [server] = await db.select().from(GameServers).limit(1);
    if (!server) throw new Error("No game server: run yarn seed first");
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const created: TestPlayer[] = [];
    for (let i = 0; i < count; i++) {
        const [user] = await db
            .insert(Users)
            .values({ email: `t_${tag}_${stamp}_${i}@erpg.test`, password: null })
            .returning();
        const name = `T${tag}${stamp}${i}`.slice(0, 40);
        const [player] = await db
            .insert(Players)
            .values({ id: generateEntityId(), userId: user.id, serverId: server.id, name })
            .returning();
        created.push({ id: player.id, userId: user.id, serverId: server.id, name });
    }
    return created;
}

/** Xoá player + user tạm (friendships, blocks, mails của họ xoá theo qua FK cascade). */
export async function removePlayers(players: TestPlayer[]) {
    if (players.length === 0) return;
    await db.delete(Players).where(
        inArray(
            Players.id,
            players.map((player) => player.id)
        )
    );
    await db.delete(Users).where(
        inArray(
            Users.id,
            players.map((player) => player.userId)
        )
    );
}

/** Thêm dòng `player_states` (class + map đầu tiên trong DB) cho player tạm để runtime nạp được; xoá theo player qua FK cascade. */
export async function createStates(players: TestPlayer[]) {
    const characterClass = classService.listStarter()[0];
    const [map] = await db.select().from(GameMaps).limit(1);
    if (!characterClass || !map) throw new Error("No class / map: run yarn seed first");
    for (const player of players) {
        await db.insert(PlayerStates).values({
            playerId: player.id,
            classId: characterClass.id,
            mapCode: map.code,
            x: 1,
            y: 2,
            hp: 100,
            mp: 50,
        });
    }
}

export const readState = async (playerId: string) => {
    const [row] = await db.select().from(PlayerStates).where(eq(PlayerStates.playerId, playerId));
    return row;
};

export { eq };
