import {
    MapSpawnKind,
    type DungeonConfig,
    type MapInteractable,
    type MonsterSpawn,
    type NewGameMap,
} from "@/modules/maps/entities/game-map.entity.js";
import { MapStatus, MapType } from "@/modules/maps/enums/map.enum.js";
import type {
    InteractableDef,
    MapDefinition,
    MonsterGroup,
} from "@/modules/maps/schemas/map-definition.schema.js";
import type { MapLayout } from "@/modules/maps/schemas/map-layout.schema.js";

/** Khoảng cách (tile) giữa các con trong cùng nhóm quái. */
export const MONSTER_GROUP_SPACING = 2;
/** Số con tối đa trên 1 hàng của nhóm. */
const GROUP_COLUMNS = 3;
const PLACEHOLDER_SIZE = 16;

/**
 * Trải các con của nhóm quanh marker `(x, y)`: hàng ngang tối đa 3 con căn giữa marker, hàng sau nằm
 * phía dưới. Mỗi con thành 1 `MonsterSpawn` (count 1) với vị trí cụ thể và `groupId` = marker.
 */
export const expandMonsterGroup = (
    group: MonsterGroup,
    x: number,
    y: number,
    defaults: { minLevel?: number; maxLevel?: number } = {}
): MonsterSpawn[] => {
    const members = group.members.flatMap((member) =>
        Array.from({ length: member.count }, () => member)
    );
    return members.map((member, index) => {
        const row = Math.floor(index / GROUP_COLUMNS);
        const inRow = Math.min(GROUP_COLUMNS, members.length - row * GROUP_COLUMNS);
        const column = index % GROUP_COLUMNS;
        return {
            groupId: group.markerId,
            monsterCode: member.monsterCode,
            count: 1,
            spawnX: round2(x + (column - (inRow - 1) / 2) * MONSTER_GROUP_SPACING),
            spawnY: round2(y + row * MONSTER_GROUP_SPACING),
            ...(member.type ? { type: member.type } : {}),
            ...(member.rarity ? { rarity: member.rarity } : {}),
            ...(member.healAfterIdleSec ? { healAfterIdleSec: member.healAfterIdleSec } : {}),
            minLevel: member.minLevel ?? defaults.minLevel,
            maxLevel: member.maxLevel ?? defaults.maxLevel,
        };
    });
};

/** Chỗ vào mặc định của map: spawn `default`; dungeon không có `default` thì lấy spawn đầu tiên. */
const entranceSpawnId = (def: MapDefinition): string | undefined =>
    def.spawnPoints.find((s) => s.kind === MapSpawnKind.DEFAULT)?.id ??
    (def.type === MapType.DUNGEON ? def.spawnPoints[0]?.id : undefined);

const round2 = (value: number) => Math.round(value * 100) / 100;

const byId = <T extends { id: string }>(items: readonly T[]) =>
    new Map(items.map((item) => [item.id, item]));

/** Mọi marker nhóm quái của định nghĩa (map thường + từng phase dungeon). */
export const allMonsterGroups = (def: MapDefinition): MonsterGroup[] => [
    ...def.monsterGroups,
    ...(def.dungeon?.chambers.flatMap((c) => c.phases.flatMap((p) => p.groups)) ?? []),
];

/** Mọi monster code định nghĩa nhắc tới (kiểm tham chiếu). */
export const definitionMonsterCodes = (def: MapDefinition): string[] =>
    allMonsterGroups(def).flatMap((group) => group.members.map((member) => member.monsterCode));

/** Layout có marker lạ (không nằm trong định nghĩa) hoặc code không khớp → danh sách lỗi (rỗng = hợp lệ). */
export const validateLayoutAgainstDefinition = (
    def: MapDefinition,
    layout: MapLayout
): string[] => {
    const errors: string[] = [];
    if (layout.code !== def.code) errors.push(`layout code "${layout.code}" != "${def.code}"`);
    const unknown = (kind: string, ids: readonly string[], known: readonly string[]) => {
        for (const id of ids) {
            if (!known.includes(id))
                errors.push(`${def.code}: ${kind} "${id}" không có trong định nghĩa`);
        }
    };
    unknown(
        "spawnPoint",
        layout.spawnPoints.map((p) => p.id),
        def.spawnPoints.map((p) => p.id)
    );
    unknown(
        "monster marker",
        layout.monsters.map((p) => p.id),
        allMonsterGroups(def).map((g) => g.markerId)
    );
    unknown(
        "npc",
        layout.npcs.map((p) => p.id),
        def.npcs.map((n) => n.id)
    );
    unknown(
        "interactable",
        layout.interactables.map((p) => p.id),
        def.interactables.map((i) => i.id)
    );
    unknown(
        "chamber",
        layout.chambers.map((c) => c.id),
        def.dungeon?.chambers.map((c) => c.id) ?? []
    );
    if (!layout.spawnPoints.some((p) => p.id === entranceSpawnId(def))) {
        errors.push(`${def.code}: thiếu vị trí spawn point mặc định`);
    }
    return errors;
};

export interface BuiltMap {
    row: NewGameMap;
    /** Marker định nghĩa có nhưng layout chưa đặt vị trí (`spawn:x`, `monster:x`, `npc:x`, `interactable:x`, `chamber:x`). */
    missing: string[];
}

/** Ghép định nghĩa (config) + layout Unity (vị trí) thành row `game_maps`. */
export const buildMapRow = (
    def: MapDefinition,
    layout: MapLayout,
    contentHash: string
): BuiltMap => {
    const missing: string[] = [];
    const spawnAt = byId(layout.spawnPoints);
    const monsterAt = byId(layout.monsters);
    const npcAt = byId(layout.npcs);
    const interactableAt = byId(layout.interactables);

    const spawnPoints = def.spawnPoints.flatMap((point) => {
        const at = spawnAt.get(point.id);
        if (!at) {
            missing.push(`spawn:${point.id}`);
            return [];
        }
        return [{ id: point.id, x: at.x, y: at.y, kind: point.kind }];
    });
    const defaultSpawn = spawnPoints.find((point) => point.id === entranceSpawnId(def));
    if (!defaultSpawn) throw new Error(`${def.code}: thiếu vị trí spawn point mặc định`);

    const expand = (groups: readonly MonsterGroup[], mapLevel = def.monsterLevel) =>
        groups.flatMap((group) => {
            const at = monsterAt.get(group.markerId);
            if (!at) {
                missing.push(`monster:${group.markerId}`);
                return [];
            }
            return expandMonsterGroup(group, at.x, at.y, {
                minLevel: mapLevel?.min,
                maxLevel: mapLevel?.max,
            });
        });

    const npcs = def.npcs.flatMap((slot) => {
        const at = npcAt.get(slot.id);
        if (!at) {
            missing.push(`npc:${slot.id}`);
            return [];
        }
        return [{ npcCode: slot.npcCode, x: at.x, y: at.y, direction: at.direction }];
    });

    const interactables = def.interactables.flatMap((item: InteractableDef) => {
        const at = interactableAt.get(item.id);
        if (!at) {
            missing.push(`interactable:${item.id}`);
            return [];
        }
        return [
            { ...item, x: at.x, y: at.y, ...(at.direction ? { direction: at.direction } : {}) },
        ] as MapInteractable[];
    });

    const monsterSpawns = expand(def.monsterGroups);
    const dungeon = def.dungeon ? buildDungeon(def, layout, expand, missing) : null;

    return {
        missing,
        row: {
            code: def.code,
            name: def.code,
            type: def.type,
            status: MapStatus.ACTIVE,
            width: layout.width,
            height: layout.height,
            tileSize: layout.tileSize,
            spawnX: defaultSpawn.x,
            spawnY: defaultSpawn.y,
            maxPlayersPerChannel: def.maxPlayersPerChannel,
            pvpEnabled: def.pvpEnabled,
            minLevel: def.minLevel,
            layoutReady: true,
            missingMarkers: missing,
            dungeon,
            monsterSpawns,
            spawnPoints,
            colliders: layout.colliders,
            npcs,
            interactables,
            contentHash,
        },
    };
};

/** Dungeon chỉ chơi được khi mọi chamber có hình học và mọi marker nhóm quái đã đặt; thiếu thì `chambers: []`. */
const buildDungeon = (
    def: MapDefinition,
    layout: MapLayout,
    expand: (groups: readonly MonsterGroup[], level?: undefined) => MonsterSpawn[],
    missing: string[]
): DungeonConfig => {
    const dungeon = def.dungeon!;
    const geometry = byId(layout.chambers);
    // Chamber đầu bắt đầu ngay chỗ vào dungeon (spawn default); các chamber sau cần `entry` trong layout.
    const entrance = layout.spawnPoints.find((p) => p.id === entranceSpawnId(def));
    const before = missing.length;
    const chambers = dungeon.chambers.map((chamber, index) => {
        const shape = geometry.get(chamber.id);
        if (!shape) missing.push(`chamber:${chamber.id}`);
        const entry =
            shape?.entry ??
            (index === 0 && entrance ? { x: entrance.x, y: entrance.y } : undefined);
        if (shape && !entry) missing.push(`chamber:${chamber.id}.entry`);
        const hasExit = chamber.hasExit ?? index < dungeon.chambers.length - 1;
        if (shape && hasExit && !shape.exit) missing.push(`chamber:${chamber.id}.exit`);
        return {
            id: chamber.id,
            bounds: shape?.bounds ?? { x: 0, y: 0, w: 1, h: 1 },
            entry: entry ?? { x: 0, y: 0 },
            phases: chamber.phases.map((phase) => ({
                id: phase.id,
                delaySec: phase.delaySec,
                monsterSpawns: expand(phase.groups),
            })),
            ...(hasExit && shape?.exit
                ? { exit: { x: shape.exit.x, y: shape.exit.y, radius: chamber.exitRadius } }
                : {}),
            ...(shape?.entryGate ? { entryGate: shape.entryGate } : {}),
            ...(shape?.exitGate && hasExit ? { exitGate: shape.exitGate } : {}),
            ...(chamber.isBoss ? { isBoss: true } : {}),
        };
    });
    const complete = missing.length === before;
    return {
        maxLevel: dungeon.maxLevel,
        ...(dungeon.timeLimitSec ? { timeLimitSec: dungeon.timeLimitSec } : {}),
        ...(dungeon.gateCode ? { gateCode: dungeon.gateCode } : {}),
        ...(dungeon.clearReward ? { clearReward: dungeon.clearReward } : {}),
        chambers: complete ? chambers : [],
    };
};

/** Map chưa có file Unity: row `inactive`, đủ config + id spawn để portal/quest tham chiếu, chưa có vị trí nào. */
export const buildPlaceholderRow = (def: MapDefinition): NewGameMap => ({
    code: def.code,
    name: def.code,
    type: def.type,
    status: MapStatus.INACTIVE,
    width: PLACEHOLDER_SIZE,
    height: PLACEHOLDER_SIZE,
    spawnX: 0.5,
    spawnY: 0.5,
    maxPlayersPerChannel: def.maxPlayersPerChannel,
    pvpEnabled: def.pvpEnabled,
    minLevel: def.minLevel,
    layoutReady: false,
    missingMarkers: [],
    dungeon:
        def.type === MapType.DUNGEON && def.dungeon
            ? { maxLevel: def.dungeon.maxLevel, chambers: [] }
            : null,
    spawnPoints: def.spawnPoints.map((point) => ({
        id: point.id,
        x: 0.5,
        y: 0.5,
        kind: point.kind,
    })),
    contentHash: "",
});

/** Tham chiếu chéo giữa các định nghĩa: portal trỏ tới map/spawn có thật, id vật thể không trùng giữa các map. */
export const validateDefinitionRefs = (defs: readonly MapDefinition[]): string[] => {
    const errors: string[] = [];
    const byCode = new Map(defs.map((def) => [def.code, def]));
    if (byCode.size !== defs.length) errors.push("map code trùng nhau");
    const interactableOwner = new Map<string, string>();
    for (const def of defs) {
        for (const item of def.interactables) {
            const owner = interactableOwner.get(item.id);
            if (owner) errors.push(`${def.code}.${item.id}: id vật thể trùng với map "${owner}"`);
            interactableOwner.set(item.id, def.code);
            if (item.type !== "portal") continue;
            const target = byCode.get(item.targetMapCode);
            if (!target) {
                errors.push(`${def.code}.${item.id}: unknown map "${item.targetMapCode}"`);
            } else if (!target.spawnPoints.some((p) => p.id === item.targetSpawnId)) {
                errors.push(
                    `${def.code}.${item.id}: unknown spawn "${item.targetMapCode}.${item.targetSpawnId}"`
                );
            }
        }
    }
    return errors;
};

/** Danh sách marker Unity phải đặt vị trí — xuất ra `map-markers.json`. */
export const mapMarkerList = (def: MapDefinition) => ({
    code: def.code,
    type: def.type,
    minLevel: def.minLevel,
    spawnPoints: def.spawnPoints,
    monsters: allMonsterGroups(def).map((group) => ({
        id: group.markerId,
        members: group.members.map((m) => ({
            monsterCode: m.monsterCode,
            count: m.count,
            type: m.type,
        })),
    })),
    npcs: def.npcs.map((slot) => ({
        id: slot.id,
        npcCode: slot.npcCode,
    })),
    interactables: def.interactables.map((item) => ({
        id: item.id,
        type: item.type,
        code: item.code,
        radius: item.radius,
        ...(item.type === "portal"
            ? { targetMapCode: item.targetMapCode, targetSpawnId: item.targetSpawnId }
            : {}),
    })),
    chambers:
        def.dungeon?.chambers.map((chamber, index) => ({
            id: chamber.id,
            isBoss: chamber.isBoss === true,
            hasExit: chamber.hasExit ?? index < def.dungeon!.chambers.length - 1,
            phases: chamber.phases.map((phase) => ({
                id: phase.id,
                delaySec: phase.delaySec,
                monsterMarkerIds: phase.groups.map((group) => group.markerId),
            })),
        })) ?? [],
});
