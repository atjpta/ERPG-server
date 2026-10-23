import { Response } from "@/core/response/response.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { levelService } from "@/modules/levels/services/level.service.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import type {
    PlayerWithState,
    PlayerSnapshot,
    CharacterSummary,
    CharacterLimits,
} from "@/modules/player/types/player.type.js";
import type { Queryable } from "@/configs/postgres.config.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { entityBodyService } from "@/modules/bodies/services/entity-body.service.js";
import type { PlayerIdentity } from "@/modules/auth/entities/player.entity.js";
import { PlayerStatus } from "@/modules/auth/enums/player-status.enum.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { gameServerService } from "@/modules/auth/services/game-server.service.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { STARTER_CLASS_CODES } from "@/modules/classes/constants/class.constant.js";
import { equipmentFactoryService } from "@/modules/equipment/services/equipment-factory.service.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import {
    ATTRIBUTE_KEYS,
    createAttributes,
    type AttributeKey,
    type Attributes,
} from "@/modules/player/schemas/stat.schema.js";
import {
    PlayerStatService,
    playerStatService,
} from "@/modules/player/services/player-stat.service.js";
import type { PlayerDatas } from "@/modules/player/entities/player-data.entity.js";
import { Direction } from "@/modules/player/enums/player.enum.js";
import { PlayerStateRepo } from "@/modules/player/repositories/player-state.repository.js";
import { mapService } from "@/modules/maps/services/map.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataService } from "@/modules/master-data/services/master-data.service.js";
import { PlayerConfigSchema } from "@/modules/master-data/schemas/master-data-value.schema.js";
import type {
    LevelProgress,
    ExpGainResult,
    AttributeAllocationResult,
} from "@/modules/player/types/player-service.type.js";

const PREFIXES = [
    "Ar",
    "Bel",
    "Cor",
    "Dra",
    "El",
    "Fen",
    "Gal",
    "Hel",
    "Ira",
    "Kai",
    "Lun",
    "Mor",
    "Nyx",
    "Or",
    "Ryn",
    "Sol",
    "Tal",
    "Vel",
    "Zan",
    "Aer",
    "Bryn",
    "Cael",
    "Dor",
    "Eld",
];

const SUFFIXES = [
    "dor",
    "wyn",
    "ric",
    "mir",
    "ra",
    "las",
    "vin",
    "eth",
    "ion",
    "os",
    "ara",
    "iel",
    "thas",
    "ius",
    "en",
    "ys",
    "gar",
    "dra",
    "mon",
    "is",
    "ane",
    "orn",
    "el",
];

export class PlayerService {
    /** Giới hạn số nhân vật + độ dài tên; field thiếu trong DB (seed cũ) lấy giá trị mặc định của schema. */
    async getCharacterLimits(dbOrTx?: Queryable): Promise<CharacterLimits> {
        const config = PlayerConfigSchema.parse(
            await masterDataService.getValue(MasterDataKey.PLAYER_CONFIG, dbOrTx)
        );
        return {
            maxCharacters: config.maxCharacters,
            nameMinLength: config.nameMinLength,
            nameMaxLength: config.nameMaxLength,
        };
    }

    /** Nhân vật của user (theo thứ tự tạo) cho màn chọn nhân vật. */
    async listCharacters(userId: string): Promise<CharacterSummary[]> {
        const players = await PlayerIdentityRepo.findByUserId({ userId });
        const states = await PlayerStateRepo.findByPlayerIds(players.map((player) => player.id));
        const stateById = new Map(states.map((state) => [state.playerId, state]));
        return players.map((player) => {
            const state = stateById.get(player.id);
            const classCode = state ? (classService.getById(state.classId)?.code ?? "") : "";
            return {
                id: player.id,
                name: player.name,
                classCode,
                baseClassCode: classCode ? classService.getBaseClassCode(classCode) : "",
                level: state?.level ?? 1,
                status: player.status,
                lastPlayedAt: player.lastPlayedAt,
            };
        });
    }

    /** Nhân vật `playerId` có phải của user không (chặn chọn nhân vật của người khác). */
    async getOwnedOrFail(userId: string, playerId: string): Promise<PlayerIdentity> {
        const player = await this.assertPlayableOrFail(playerId);
        if (player.userId !== userId) {
            Response.abort(PlayerErrorCode.PLAYER_NOT_FOUND);
        }
        return player;
    }

    /** Tên ngẫu nhiên chưa ai dùng trên server mặc định (thử vài lần, thêm số nếu trùng). */
    async randomName(): Promise<Response<string>> {
        const limits = await this.getCharacterLimits();
        const server = await gameServerService.getDefaultOnlineOrFail();
        for (let attempt = 0; attempt < 8; attempt++) {
            const name = this.generateName({
                minLength: limits.nameMinLength,
                maxLength: limits.nameMaxLength,
                attempt,
            });
            const taken = await PlayerIdentityRepo.findByServerAndName({
                serverId: server.id,
                name,
            });
            if (!taken) return Response.success(name);
        }
        return Response.error(PlayerErrorCode.PLAYER_NAME_EXISTS);
    }

    /** Độ dài tên theo master data; sai → lỗi PLAYER_NAME_INVALID. */
    private checkNameLength(name: string, limits: CharacterLimits): Response<null> {
        const length = this.nameLength(name);
        if (length < limits.nameMinLength || length > limits.nameMaxLength) {
            return Response.error(PlayerErrorCode.PLAYER_NAME_INVALID);
        }
        return Response.success();
    }

    /** Player đầu tiên của user; chưa tạo nhân vật → `null`. */
    async findByUserId(userId: string, dbOrTx?: Queryable): Promise<PlayerWithState | null> {
        const [player] = await PlayerIdentityRepo.findByUserId({ userId, dbOrTx });
        return player ? this.findWithStateById(player.id, dbOrTx) : null;
    }

    /**
     * Tạo nhân vật: chọn tên + class khởi đầu (tier 1), mặc sẵn bộ đồ tân thủ của class đó. Mỗi user có
     * tối đa `player_config.maxCharacters` nhân vật.
     */
    async createCharacter(params: {
        userId: string;
        name: string;
        classCode: string;
    }): Promise<Response<PlayerWithState>> {
        const { userId, name, classCode } = params;
        const characterClass = classService.getByCode(classCode);
        if (
            !characterClass ||
            characterClass.tier !== 1 ||
            !(STARTER_CLASS_CODES as readonly string[]).includes(classCode)
        ) {
            return Response.error(PlayerErrorCode.CLASS_NOT_AVAILABLE);
        }
        return withTransaction(async (tx) => {
            const limits = await this.getCharacterLimits(tx);
            const nameCheck = this.checkNameLength(name, limits);
            if (Response.isError(nameCheck)) return nameCheck;
            const existing = await PlayerIdentityRepo.findByUserId({ userId, dbOrTx: tx });
            if (existing.length >= limits.maxCharacters) {
                return Response.error(PlayerErrorCode.PLAYER_LIMIT_REACHED);
            }
            const server = await gameServerService.getDefaultOnlineOrFail(tx);
            const duplicated = await PlayerIdentityRepo.findByServerAndName({
                serverId: server.id,
                name,
                dbOrTx: tx,
            });
            if (duplicated) return Response.error(PlayerErrorCode.PLAYER_NAME_EXISTS);
            const config = await masterDataService.getValue(MasterDataKey.PLAYER_CONFIG, tx);
            const startMap = await mapService.getActiveByCodeOrFail(config.startMapCode, tx);
            const equipments = equipmentFactoryService.createStarterEquipments(classCode);
            const { stats } = playerStatService.compute({
                classId: characterClass.id,
                allocatedAttributes: createAttributes(),
                equipments,
            });
            const player = await PlayerIdentityRepo.create({
                data: { userId, serverId: server.id, name },
                dbOrTx: tx,
            });
            const state = await PlayerStateRepo.create(
                {
                    playerId: player.id,
                    classId: characterClass.id,
                    level: 1,
                    exp: 0,
                    hp: PlayerStatService.whole(stats, StatKey.MAX_HP),
                    mp: PlayerStatService.whole(stats, StatKey.MAX_MP),
                    mapCode: startMap.code,
                    x: startMap.spawnX,
                    y: startMap.spawnY,
                    direction: Direction.DOWN,
                    // The Unity prefab's body; a room refreshes it from the prefab whenever the player joins.
                    ...(entityBodyService.classBody(characterClass.code) ?? {}),
                    skills: characterClass.skills,
                    equipments,
                },
                tx
            );
            return Response.success(this.combine(player, state));
        });
    }

    async rename(playerId: string, name: string): Promise<Response<PlayerWithState>> {
        const nameCheck = this.checkNameLength(name, await this.getCharacterLimits());
        if (Response.isError(nameCheck)) return nameCheck;
        const player = await PlayerIdentityRepo.findByIdOrFail({
            id: playerId,
            code: PlayerErrorCode.PLAYER_NOT_FOUND,
        });
        const duplicated = await PlayerIdentityRepo.findByServerAndName({
            serverId: player.serverId,
            name,
            excludeId: player.id,
        });
        if (duplicated) return Response.error(PlayerErrorCode.PLAYER_NAME_EXISTS);
        await PlayerIdentityRepo.updateById({ id: playerId, data: { name } });
        return Response.success(await this.findWithStateById(playerId));
    }

    async getPlayableSnapshotOrFail(id: string): Promise<PlayerSnapshot> {
        const player = await this.assertPlayableOrFail(id);
        const state = await PlayerStateRepo.findByPlayerId(id);
        if (!state) throw new Error(`Player state not found for player ${id}`);
        return { ...this.combine(player, state), stateRevision: state.revision };
    }

    async assertPlayableOrFail(id: string): Promise<PlayerIdentity> {
        const player = await PlayerIdentityRepo.findByIdOrFail({
            id,
            code: PlayerErrorCode.PLAYER_NOT_FOUND,
        });
        if (player.status === PlayerStatus.DELETED) {
            Response.abort(PlayerErrorCode.PLAYER_NOT_FOUND);
        }
        if (player.status === PlayerStatus.BANNED) {
            Response.abort(PlayerErrorCode.PLAYER_BANNED);
        }
        return player;
    }

    /**
     * Soft delete: the character stays in the database (support can restore it) but leaves the character list,
     * stops counting toward the limit and releases its name. Banned characters cannot be deleted (no evading a ban).
     */
    async deleteCharacter(params: { userId: string; playerId: string }): Promise<PlayerIdentity> {
        const { userId, playerId } = params;
        const player = await this.getOwnedOrFail(userId, playerId);
        await PlayerIdentityRepo.updateById({
            id: player.id,
            data: { status: PlayerStatus.DELETED },
        });
        return player;
    }

    async findWithStateById(id: string, dbOrTx?: Queryable): Promise<PlayerWithState> {
        const [player, state] = await Promise.all([
            PlayerIdentityRepo.findByIdOrFail({
                id,
                dbOrTx,
                code: PlayerErrorCode.PLAYER_NOT_FOUND,
            }),
            PlayerStateRepo.findByPlayerId(id, dbOrTx),
        ]);
        if (!state) throw new Error(`Player state not found for player ${id}`);
        return this.combine(player, state);
    }

    private combine(player: PlayerIdentity, state: PlayerDatas): PlayerWithState {
        const {
            playerId: _playerId,
            updatedAt: _stateUpdatedAt,
            revision: _revision,
            ...gameState
        } = state;
        return { ...player, ...gameState };
    }

    /** Chữ (kể cả tiếng Việt có dấu), số và `_`. */
    readonly namePattern = /^[\p{L}\p{N}_]+$/u;

    /** Độ dài tên tính theo ký tự (không theo UTF-16 code unit) — "Đạt" là 3. */
    nameLength(name: string) {
        return [...name].length;
    }

    /**
     * Tên ngẫu nhiên kiểu fantasy (Ar + dor → "Ardor") trong khoảng [minLength, maxLength]; `attempt` > 0
     * (tên vừa sinh đã có người dùng) thì thêm số phía sau cho dễ trùng ít hơn, vẫn giữ độ dài tối đa.
     */
    generateName(params: {
        minLength: number;
        maxLength: number;
        attempt?: number;
        rng?: () => number;
    }): string {
        const { minLength, maxLength, attempt = 0, rng = Math.random } = params;
        const pick = (list: readonly string[]) => list[Math.floor(rng() * list.length)];

        let name = pick(PREFIXES) + pick(SUFFIXES);
        while (this.nameLength(name) < minLength) name += pick(SUFFIXES);
        if (attempt > 0) {
            const digits = String(Math.floor(rng() * 10 ** Math.min(4, attempt + 1)));
            name = name.slice(0, Math.max(1, maxLength - digits.length)) + digits;
        }
        return [...name].slice(0, maxLength).join("");
    }

    /**
     * Cộng exp và lên level liên tiếp khi đủ (dư exp chuyển sang level sau). `expToNext(level)` trả
     * `undefined` ở level tối đa — exp vẫn cộng nhưng dừng ở đó.
     */
    gainExp(
        progress: LevelProgress,
        amount: number,
        expToNext: (level: number) => number | undefined
    ): ExpGainResult {
        let { level, exp } = progress;
        exp += Math.max(0, amount);
        let levelsGained = 0;
        for (
            let need = expToNext(level);
            need !== undefined && need > 0 && exp >= need;
            need = expToNext(level)
        ) {
            exp -= need;
            level++;
            levelsGained++;
        }
        return { level, exp, levelsGained };
    }

    /** Điểm attribute / kỹ năng nhận được khi lên `levelsGained` level. */
    levelUpPoints(levelsGained: number) {
        return {
            attributePoints: levelsGained * levelService.attributePointsPerLevel,
            skillPoints: levelsGained * levelService.skillPointsPerLevel,
        };
    }

    /**
     * Cộng điểm tiềm năng vào attribute: mỗi giá trị là số nguyên ≥ 0, tổng > 0 và không vượt số điểm
     * đang có. Trả `Response` thất bại thay vì throw để room trả về cho client.
     */
    updateAttributePoints(
        allocated: Attributes,
        available: number,
        request: Partial<Record<AttributeKey, number>>
    ): Response<AttributeAllocationResult> {
        let total = 0;
        for (const key of ATTRIBUTE_KEYS) {
            const value = request[key] ?? 0;
            if (!Number.isInteger(value) || value < 0)
                return Response.error(CommonCode.INVALID_INPUT);
            total += value;
        }
        if (total <= 0) return Response.error(PlayerErrorCode.ATTRIBUTE_NO_POINTS);
        if (total > available) return Response.error(PlayerErrorCode.ATTRIBUTE_POINTS_NOT_ENOUGH);

        const allocatedAttributes = { ...allocated };
        for (const key of ATTRIBUTE_KEYS) allocatedAttributes[key] += request[key] ?? 0;
        return Response.success({ allocatedAttributes, attributePoints: available - total });
    }
}

export const playerService = new PlayerService();
