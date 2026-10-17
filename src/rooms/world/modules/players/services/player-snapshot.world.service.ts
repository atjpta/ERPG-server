import type { PlayerState } from "@/modules/player/entities/player-state.entity.js";
import { fromInventories, toInventories } from "@/modules/player/schemas/inventory.schema.js";
import type { PlayerSnapshot } from "@/modules/player/types/player.type.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";

export class PlayerSnapshotWorldService {
    /** Level, exp, ví tiền, điểm chưa dùng — từ DB (lúc vào room / sau khi đồng bộ lại). */
    applyProgress(state: PlayerWorldState, player: PlayerSnapshot) {
        state.setLevelProgress(player.level, player.exp);
        state.wallet = structuredClone(player.wallet);
        state.attributePoints = player.attributePoints;
        state.skillPoints = player.skillPoints;
        state.allocatedAttributes = { ...player.allocatedAttributes };
        state.flags = { ...player.flags };
        state.quests = structuredClone(player.quests);
        state.lastTownMapCode = player.lastTownMapCode;
        state.dailyQuests = player.dailyQuests ? structuredClone(player.dailyQuests) : null;
    }

    /** Phần state được lưu xuống DB (checkpoint định kỳ và lúc rời room). */
    toSavedState(
        state: PlayerWorldState,
        mapCode: string,
        pendingPosition: { x: number; y: number }
    ): Pick<
        PlayerState,
        | "mapCode"
        | "x"
        | "y"
        | "direction"
        | "hp"
        | "mp"
        | "level"
        | "exp"
        | "wallet"
        | "attributePoints"
        | "skillPoints"
        | "allocatedAttributes"
        | "equipments"
        | "equipmentInventory"
        | "consumableInventory"
        | "materialInventory"
        | "flags"
        | "quests"
        | "lastTownMapCode"
        | "dungeonSession"
        | "dailyQuests"
    > {
        // Trong dungeon (hoặc đang bước vào): lưu chỗ quay về — mất kết nối thì đăng nhập lại ở ngoài dungeon.
        const session = state.dungeonSession;
        return {
            // Đang chuyển map (portal/teleport): lưu map đích để rời room không ghi đè về map cũ.
            mapCode: session?.returnMapCode ?? state.pendingMapCode ?? mapCode,
            x: session?.returnX ?? (state.pendingMapCode ? pendingPosition.x : state.x),
            y: session?.returnY ?? (state.pendingMapCode ? pendingPosition.y : state.y),
            lastTownMapCode: state.lastTownMapCode,
            dailyQuests: state.dailyQuests ? structuredClone(state.dailyQuests) : null,
            dungeonSession: session ? { ...session } : null,
            direction: state.direction as PlayerState["direction"],
            hp: state.hp,
            mp: state.mp,
            level: state.level,
            exp: state.exp,
            wallet: structuredClone(state.wallet),
            attributePoints: state.attributePoints,
            skillPoints: state.skillPoints,
            allocatedAttributes: { ...state.allocatedAttributes },
            equipments: structuredClone(state.equipments),
            ...structuredClone(fromInventories(state.inventories)),
            flags: { ...state.flags },
            quests: structuredClone(state.quests),
        };
    }

    syncSnapshot(state: PlayerWorldState, player: PlayerSnapshot) {
        state.x = player.x;
        state.y = player.y;
        state.direction = player.direction === "left" ? "left" : "right";
        state.hp = player.hp;
        state.mp = player.mp;
        this.applyProgress(state, player);
        state.equipments = structuredClone(player.equipments);
        state.inventories = structuredClone(toInventories(player));
        state.refreshStats();
        state.stateRevision = player.stateRevision;
        state.moving = false;
    }
}
export const playerSnapshotWorldService = new PlayerSnapshotWorldService();
