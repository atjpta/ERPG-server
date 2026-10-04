import { randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import type { Queryable } from "@/configs/postgres.config.js";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { BaseService } from "@/core/services/base.service.js";
import { serviceError } from "@/core/utils/service-error.js";
import { Players, type PlayerIdentity } from "@/modules/auth/entities/player.entity.js";
import { PlayerStatus } from "@/modules/auth/enums/player-status.enum.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { gameServerService } from "@/modules/auth/user/services/game-server.service.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { PLAYER_DEFAULT_CLASS_CODE } from "@/modules/player/constants/player.constant.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import { createEquipments } from "@/modules/player/schemas/inventory.schema.js";
import { createAttributes } from "@/modules/player/schemas/stat.schema.js";
import {
    PlayerStatService,
    playerStatService,
} from "@/modules/player/user/services/player-stat.service.js";
import type { PlayerState } from "@/modules/player/entities/player-state.entity.js";
import { Direction } from "@/modules/player/enums/player.enum.js";
import { PlayerStateRepo } from "@/modules/player/repositories/player-state.repository.js";
import { mapService } from "@/modules/maps/user/services/map.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataService } from "@/modules/master-data/user/services/master-data.service.js";

export type PlayerWithState = PlayerIdentity &
    Omit<PlayerState, "playerId" | "updatedAt" | "revision">;
export type PlayerSnapshot = PlayerWithState & { stateRevision: number };

export class PlayerService extends BaseService<typeof Players> {
    constructor() {
        super(PlayerIdentityRepo);
    }

    /** Create the auth record and initial gameplay state in one transaction. */
    async ensureDefault(userId: string, dbOrTx?: Queryable): Promise<PlayerWithState> {
        return withTransaction(async (tx) => {
            const [existing] = await PlayerIdentityRepo.findByUserId({ userId, dbOrTx: tx });
            if (existing) return this.findWithStateById(existing.id, tx);

            const server = await gameServerService.getDefaultOnlineOrFail(tx);
            const config = await masterDataService.getValue(MasterDataKey.PLAYER_CONFIG, tx);
            const startMap = await mapService.getActiveByCodeOrFail(config.startMapCode, tx);
            const defaultClass = classService.getByCode(PLAYER_DEFAULT_CLASS_CODE);
            if (!defaultClass) throw new Error(`Class "${PLAYER_DEFAULT_CLASS_CODE}" not found`);
            const { stats } = playerStatService.compute({
                classId: defaultClass.id,
                allocatedAttributes: createAttributes(),
                equipments: createEquipments(),
            });
            const player = await PlayerIdentityRepo.create({
                data: {
                    userId,
                    serverId: server.id,
                    name: `Hero_${randomBytes(3).toString("hex")}`,
                },
                dbOrTx: tx,
            });
            const state = await PlayerStateRepo.create(
                {
                    playerId: player.id,
                    classId: defaultClass.id,
                    level: 1,
                    exp: 0,
                    hp: PlayerStatService.whole(stats, StatKey.MAX_HP),
                    mp: PlayerStatService.whole(stats, StatKey.MAX_MP),
                    mapCode: startMap.code,
                    x: startMap.spawnX,
                    y: startMap.spawnY,
                    direction: Direction.DOWN,
                    hitbox: { width: 0.4, height: 0.6, offsetX: 0, offsetY: 0.35 },
                    collider: { width: 0.3, height: 0.1, offsetX: 0, offsetY: 0.1 },
                    skills: defaultClass.skills,
                },
                tx
            );
            return this.combine(player, state);
        }, dbOrTx);
    }

    async rename(playerId: string, name: string) {
        const player = await PlayerIdentityRepo.findByIdOrFail({
            id: playerId,
            message: "Player not found",
            code: ResponseCode.PLAYER_NOT_FOUND,
        });
        const duplicated = await PlayerIdentityRepo.findByServerAndName({
            serverId: player.serverId,
            name,
            excludeId: player.id,
        });
        if (duplicated) {
            serviceError("Player name is existed", 409, ResponseCode.PLAYER_NAME_EXISTS);
        }
        await PlayerIdentityRepo.updateById({ id: playerId, data: { name } });
        return this.findWithStateById(playerId);
    }

    async getPlayableOrFail(id: string): Promise<PlayerWithState> {
        await this.assertPlayableOrFail(id);
        return this.findWithStateById(id);
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
            message: "Player not found",
            code: ResponseCode.PLAYER_NOT_FOUND,
        });
        if (player.status === PlayerStatus.BANNED) {
            serviceError("Player is banned", 403, ResponseCode.PLAYER_BANNED);
        }
        return player;
    }

    async findWithStateById(id: string, dbOrTx?: Queryable): Promise<PlayerWithState> {
        const [player, state] = await Promise.all([
            PlayerIdentityRepo.findByIdOrFail({ id, dbOrTx, message: "Player not found" }),
            PlayerStateRepo.findByPlayerId(id, dbOrTx),
        ]);
        if (!state) throw new Error(`Player state not found for player ${id}`);
        return this.combine(player, state);
    }

    async saveState(
        id: string,
        data: Pick<PlayerState, "mapCode" | "x" | "y" | "direction" | "hp" | "mp"> &
            Partial<
                Pick<
                    PlayerState,
                    | "level"
                    | "exp"
                    | "wallet"
                    | "attributePoints"
                    | "skillPoints"
                    | "allocatedAttributes"
                >
            >,
        expectedRevision?: number
    ) {
        return withTransaction(async (tx) => {
            const state =
                expectedRevision !== undefined
                    ? await PlayerStateRepo.updateIfUnchanged(id, expectedRevision, data, tx)
                    : await PlayerStateRepo.updateByPlayerId(id, data, tx);
            if (!state) {
                throw new Error(
                    expectedRevision !== undefined
                        ? `Player state changed while online for player ${id}`
                        : `Player state not found for player ${id}`
                );
            }
            await PlayerIdentityRepo.updateById({
                id,
                data: { lastPlayedAt: DateTime.now().toJSDate() },
                dbOrTx: tx,
            });
            return state;
        });
    }

    private combine(player: PlayerIdentity, state: PlayerState): PlayerWithState {
        const {
            playerId: _playerId,
            updatedAt: _stateUpdatedAt,
            revision: _revision,
            ...gameState
        } = state;
        return { ...player, ...gameState };
    }
}

export const playerService = new PlayerService();
