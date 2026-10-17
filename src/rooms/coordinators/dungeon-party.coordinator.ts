import { partyRoomRemote } from "@/rooms/party/party.remote.js";
import { partyDirectoryService } from "@/rooms/party/services/party-directory.service.js";
import type { DungeonFailure, DungeonPartyRequest } from "@/rooms/party/types/party-room.type.js";
import { worldRoomRemote } from "@/rooms/world/world.remote.js";
import { randomUUID } from "node:crypto";

const failureReason = (error: string): DungeonFailure["reason"] =>
    error === "dead" || error === "level_too_low" || error === "in_dungeon"
        ? (error as DungeonFailure["reason"])
        : ("offline" as DungeonFailure["reason"]);

/** Coordinates room-owned checks; neither room knows its peer's implementation. */
export class DungeonPartyCoordinator {
    constructor(
        private readonly party = partyRoomRemote,
        private readonly world = worldRoomRemote
    ) {}
    async launch(
        partyRoomId: string,
        request: DungeonPartyRequest
    ): Promise<{ ok: boolean; error?: string }> {
        const plan = await this.party(partyRoomId).prepareDungeon(request);
        if (!plan) return { ok: false, error: "unavailable" };
        if (!plan.ok) return plan;
        const checks = await Promise.all(
            plan.members.map(async (member) => ({
                member,
                error: member.worldRoomId
                    ? await this.world(member.worldRoomId).partyCheckDungeon(
                          member.playerId,
                          request.code,
                          request.retry
                      )
                    : "offline",
            }))
        );
        const denied = async (results: typeof checks) => {
            const failures = results
                .filter(({ error }) => error)
                .map(({ member, error }) => ({
                    playerId: member.playerId,
                    name: member.name,
                    reason: failureReason(error!),
                }));
            if (!failures.length) return false;
            await this.party(partyRoomId).notifyDungeonDenied(request.code, failures);
            return true;
        };
        if (await denied(checks)) return { ok: false, error: "denied" };
        const instanceId = randomUUID();
        await partyDirectoryService.setDungeonExpectation(instanceId, {
            dungeonCode: request.code,
            leaderPlayerId: request.leaderPlayerId,
            expected: plan.members.map((m) => m.playerId),
        });
        const results = await Promise.all(
            plan.members.map(async (member) => ({
                member,
                error: await this.world(member.worldRoomId!).partyEnterDungeon(
                    member.playerId,
                    request.code,
                    instanceId,
                    request.spawnId,
                    request.retry
                ),
            }))
        );
        return { ok: !(await denied(results)) };
    }
}
export const dungeonPartyCoordinator = new DungeonPartyCoordinator();
