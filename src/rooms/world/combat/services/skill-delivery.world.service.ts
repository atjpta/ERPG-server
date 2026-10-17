import {
    CrowdControlType,
    DamageScalingType,
    DamageType,
    HitDelivery,
    HitShape,
    ProjectileHitBehavior,
    ResourceType,
    SkillEffectType,
} from "@/modules/skills/enums/skill.enum.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import { PlayerStatService } from "@/modules/player/services/player-stat.service.js";
import { AuraWorldState } from "@/rooms/world/schema/aura.world.state.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import {
    WorldMessage,
    type PotionUsedMessage,
    type SkillEffectMessage,
} from "@/rooms/world/world.message.js";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import type { SkillAllies, SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import { AreaWorldState } from "@/rooms/world/schema/area.world.state.js";
import { ProjectileWorldState } from "@/rooms/world/schema/projectile.world.state.js";
import {
    getAuraDurationTicks,
    getAuraEvent,
    getAuraRadii,
    type PendingSkillHit,
    claimGroupHit,
} from "@/rooms/world/combat/utils/skill-attack.world.util.js";
import {
    intersectsSkillHitEvent,
    offsetSkillOrigin,
} from "@/rooms/world/combat/utils/skill-hitbox.world.util.js";
import {
    SkillOwner,
    SkillTarget,
    applySkillHit,
    findSkillTargets,
    playerSkillOwner,
} from "@/rooms/world/combat/utils/skill-owner.world.util.js";
import { millisecondsToTicks } from "@/rooms/world/core/utils/tick.world.util.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Bước kiểm tra va chạm tối đa (ô) của đạn trong 1 tick — đạn nhanh không xuyên qua mục tiêu nhỏ. */
const PROJECTILE_MAX_SWEEP_STEP = 0.1;

export interface SkillDeliveryParams {
    owner: SkillOwner;
    skill: Skill;
    hit: PendingSkillHit;
    /** Vị trí bên đánh lúc hit nổ (chân nhân vật, toạ độ server). */
    originX: number;
    originY: number;
    /** Mục tiêu để ngắm (PROJECTILE) / đặt vùng (AREA); không có → theo hướng mặt. */
    aim?: SkillTarget;
}

/**
 * Đưa một hit event tới mục tiêu theo `delivery`:
 * - HITBOX: vùng quanh người đánh, gây damage ngay.
 * - PROJECTILE: sinh `ProjectileWorldState`, mỗi tick bay một đoạn và trúng khi chạm hitbox mục tiêu.
 * - AREA: sinh `AreaWorldState` tại mục tiêu, gây damage cả vùng sau `area.delayMs`.
 * - ALLIES: hồi một lần cho người dùng và đồng đội cùng party trong vùng elip quanh người dùng, rồi báo client gắn hiệu ứng
 *   của skill lên từng người đó (`SKILL_EFFECT`); "+N" hiện cả khi người được hồi đã đầy máu.
 * - AURA: `startAura` sinh `AuraWorldState` bám theo người dùng, mỗi chu kỳ hồi máu bản thân + đồng đội cùng party
 *   trong vùng và gây damage quái trong vùng; hết thời gian (hoặc người dùng chết / rời room) thì mới tính hồi chiêu.
 * `chain()` chạy mỗi tick sau player và monster.
 */
export class SkillDeliveryWorldService {
    private nextId = 0;

    deliver(room: WorldRoom, params: SkillDeliveryParams): void {
        switch (params.hit.event.delivery ?? HitDelivery.HITBOX) {
            case HitDelivery.PROJECTILE:
                this.spawnProjectile(room, params);
                return;
            case HitDelivery.AREA:
                this.spawnArea(room, params);
                return;
            case HitDelivery.AURA:
                // Vùng buff bắt đầu ngay lúc bấm (startAura), không đi qua lịch hit.
                return;
            case HitDelivery.ALLIES:
                this.healAllies(room, params);
                return;
            default:
                this.resolveHitbox(room, params);
        }
    }

    /**
     * Bắt đầu vùng buff của skill AURA cho `player` (đã trừ mana, đã bắt đầu đòn). Kích thước và thời gian tồn tại theo
     * `level` của skill; mỗi người dùng chỉ có một vùng cho mỗi skill nên vùng cũ (nếu còn) bị thay.
     */
    startAura(
        room: WorldRoom,
        params: {
            sessionId: string;
            player: PlayerWorldState;
            skill: Skill;
            slot: number;
            level: number;
        }
    ): void {
        const { sessionId, player, skill, slot, level } = params;
        const found = getAuraEvent(skill);
        if (!found) {
            console.warn(`[Skill] ${skill.code}: AURA hit event without aura config`);
            return;
        }
        for (const aura of [...room.state.auras.values()]) {
            if (aura.sessionId === sessionId && aura.slot === slot)
                room.state.auras.delete(aura.id);
        }

        const { radiusX, radiusY } = getAuraRadii(found.aura, level);
        const id = this.newId("a");
        const aura = new AuraWorldState({
            id,
            owner: playerSkillOwner(sessionId, player),
            sessionId,
            skillId: skill.id,
            slot,
            aura: found.aura,
            eventIndex: found.eventIndex,
            radiusX,
            radiusY,
            durationTicks: getAuraDurationTicks(found.aura, level, room.tickRate),
            tickEvery: millisecondsToTicks(found.aura.tickMs, room.tickRate),
            cooldownTicks:
                skill.cooldownMs > 0 ? millisecondsToTicks(skill.cooldownMs, room.tickRate) : 0,
            attackSerial: player.attackSerial,
        });
        aura.ticksToNext = 1; // lượt hiệu ứng đầu ngay tick sau, rồi mỗi chu kỳ
        room.state.auras.set(id, aura);
    }

    chain(room: WorldRoom, dt: number): void {
        for (const aura of [...room.state.auras.values()]) {
            if (!this.stepAura(room, aura)) this.removeAura(room, aura);
        }
        for (const projectile of [...room.state.projectiles.values()]) {
            if (!this.stepProjectile(room, projectile, dt)) {
                room.state.projectiles.delete(projectile.id);
            }
        }
        for (const area of [...room.state.areas.values()]) {
            if (area.ticksUntilImpact > 0) {
                area.ticksUntilImpact--;
                continue;
            }
            this.resolveArea(room, area);
            if (--area.pulsesLeft > 0) {
                // Lần gây damage kế tiếp sau `pulseEvery` tick (đổi seed để mỗi lần roll riêng).
                area.ticksUntilImpact = area.pulseEvery - 1;
                area.attackSerial++;
                continue;
            }
            room.state.areas.delete(area.id);
        }
    }

    /** Một tick của vùng buff. `false` = hết thời gian, hoặc người dùng chết / rời room. */
    private stepAura(room: WorldRoom, aura: AuraWorldState): boolean {
        const player = room.state.players.get(aura.sessionId);
        if (!player || player.id !== aura.owner.id || player.hp <= 0) return false;

        if (--aura.ticksToNext <= 0) {
            aura.ticksToNext = aura.tickEvery;
            this.pulseAura(room, aura, player);
        }
        return --aura.ticksLeft > 0;
    }

    /**
     * Một chu kỳ: hồi `healScaling × MAGIC_ATTACK` cho bản thân và đồng đội cùng party đang đứng trong vùng, gây
     * `damageScaling × MAGIC_ATTACK` (phép) cho quái trong vùng. Vùng là elip tâm tại chân người dùng.
     */
    private pulseAura(room: WorldRoom, aura: AuraWorldState, player: PlayerWorldState): void {
        const config = aura.aura;
        const zone = auraZoneEvent(aura, config.damageScaling);
        const origin = { x: player.x, y: player.y, direction: "right" };

        if (config.healScaling > 0) {
            const magic = PlayerStatService.whole(player.stats, StatKey.MAGIC_ATTACK);
            this.healAlliesInZone(
                room,
                player,
                zone,
                Math.max(1, Math.floor(magic * config.healScaling))
            );
        }

        if (config.damageScaling > 0) {
            const hit = {
                event: zone,
                attackSerial: ++player.attackSerial,
                eventIndex: aura.eventIndex,
            };
            for (const target of findSkillTargets(room, aura.owner)) {
                if (!intersectsSkillHitEvent(origin, target.x, target.y, target.hitbox, zone))
                    continue;
                applySkillHit(room, aura.owner, target.id, hit);
            }
        }
    }

    /**
     * Hit ALLIES: hồi `healBase + healScaling × MAGIC_ATTACK` cho người dùng và đồng đội cùng party trong vùng elip quanh người
     * dùng, rồi báo client gắn hiệu ứng của skill lên từng người được hồi.
     */
    private healAllies(room: WorldRoom, { owner, skill, hit }: SkillDeliveryParams): void {
        const allies = hit.event.allies;
        if (!allies) {
            console.warn(`[Skill] ${skill.code}: ALLIES hit event without allies config`);
            return;
        }
        if (owner.kind !== "player") return;
        const player = room.state.players.get(owner.sessionId);
        if (!player || player.id !== owner.id || player.hp <= 0) return;

        const magic = PlayerStatService.whole(player.stats, StatKey.MAGIC_ATTACK);
        const amount = Math.max(1, Math.floor(allies.healBase + magic * allies.healScaling));
        const healed = this.healAlliesInZone(
            room,
            player,
            alliesZoneEvent(allies, hit.eventIndex),
            amount
        );
        if (healed.length === 0) return;
        const message: SkillEffectMessage = { skillId: skill.id, sessionIds: healed };
        room.broadcast(WorldMessage.SKILL_EFFECT, message);
    }

    /**
     * Hồi `amount` cho người dùng và đồng đội cùng party còn sống đang đứng trong `zone` (elip tâm tại người dùng). Mỗi người được
     * hồi nhận "+amount" trên đầu — kể cả khi đã đầy máu, để thấy skill đã trúng. Trả về session của những người đó.
     */
    private healAlliesInZone(
        room: WorldRoom,
        player: PlayerWorldState,
        zone: SkillHitEvent,
        amount: number
    ): string[] {
        const origin = { x: player.x, y: player.y, direction: "right" };
        const healed: string[] = [];
        for (const [sessionId, ally] of room.state.players) {
            if (ally.hp <= 0) continue;
            const isAlly =
                ally === player ||
                (player.partyRoomId !== null && ally.partyRoomId === player.partyRoomId);
            if (!isAlly || !intersectsSkillHitEvent(origin, ally.x, ally.y, ally.hitbox, zone)) {
                continue;
            }
            ally.heal(amount);
            const message: PotionUsedMessage = { sessionId, hp: amount, mp: 0 };
            room.broadcast(WorldMessage.POTION_USED, message);
            healed.push(sessionId);
        }
        return healed;
    }

    /** Vùng buff hết: bỏ khỏi state, và hồi chiêu của skill bắt đầu tính từ bây giờ. */
    private removeAura(room: WorldRoom, aura: AuraWorldState): void {
        room.state.auras.delete(aura.id);
        const player = room.state.players.get(aura.sessionId);
        if (player && player.id === aura.owner.id) {
            player.setSkillCooldownTicks(aura.slot, aura.cooldownTicks);
        }
    }

    private resolveHitbox(room: WorldRoom, { owner, hit, originX, originY }: SkillDeliveryParams) {
        const origin = { x: originX, y: originY, direction: hit.direction, aim: hit.aim };
        for (const target of findSkillTargets(room, owner)) {
            if (
                intersectsSkillHitEvent(origin, target.x, target.y, target.hitbox, hit.event) &&
                claimGroupHit(hit, target.id)
            ) {
                applySkillHit(room, owner, target.id, hit);
            }
        }
    }

    private spawnProjectile(room: WorldRoom, params: SkillDeliveryParams): void {
        const { owner, skill, hit, aim } = params;
        const projectile = hit.event.projectile;
        if (!projectile) {
            console.warn(`[Skill] ${skill.code}: PROJECTILE hit event without projectile config`);
            return;
        }

        // Đạn xuất phát đúng vị trí người đánh, bay về giữa hitbox mục tiêu.
        const forward = hit.direction === "left" ? -1 : 1;
        const { x, y } = offsetSkillOrigin(
            params.originX,
            params.originY,
            hit.direction,
            hit.event
        );
        let dirX = forward;
        let dirY = 0;
        if (aim) {
            const dx = aim.x + aim.hitbox.offsetX - x;
            const dy = aim.y - aim.hitbox.offsetY - y;
            const length = Math.hypot(dx, dy);
            if (length > 1e-6) {
                dirX = dx / length;
                dirY = dy / length;
            }
        }

        const id = this.newId("p");
        room.state.projectiles.set(
            id,
            new ProjectileWorldState({
                id,
                owner,
                skillId: skill.id,
                hit,
                projectile,
                x,
                y,
                dirX,
                dirY,
            })
        );
    }

    /** Bay 1 tick, trúng mục tiêu dọc đường. `false` = đạn hết (trúng đủ, hết tầm, ra khỏi map). */
    private stepProjectile(room: WorldRoom, projectile: ProjectileWorldState, dt: number): boolean {
        const distance = Math.min(
            projectile.speed * dt,
            projectile.maxDistance - projectile.traveled
        );
        const steps = Math.max(1, Math.ceil(distance / PROJECTILE_MAX_SWEEP_STEP));
        const stepDistance = distance / steps;
        const body = projectileBody(projectile);
        const targets = findSkillTargets(room, projectile.owner);
        const maxHits =
            projectile.projectile.hitBehavior === ProjectileHitBehavior.PIERCE
                ? projectile.projectile.maxHits
                : 1;

        for (let step = 0; step < steps; step++) {
            projectile.x += projectile.dirX * stepDistance;
            projectile.y += projectile.dirY * stepDistance;
            projectile.traveled += stepDistance;
            const origin = { x: projectile.x, y: projectile.y, direction: "right" };
            for (const target of targets) {
                if (projectile.hitIds.has(target.id)) continue;
                if (!intersectsSkillHitEvent(origin, target.x, target.y, target.hitbox, body)) {
                    continue;
                }
                projectile.hitIds.add(target.id);
                applySkillHit(room, projectile.owner, target.id, projectile);
                if (projectile.hitIds.size >= maxHits) return false;
            }
        }

        const inMap =
            projectile.x >= 0 &&
            projectile.y >= 0 &&
            projectile.x <= room.map.width &&
            projectile.y <= room.map.height;
        return inMap && projectile.traveled < projectile.maxDistance;
    }

    private spawnArea(room: WorldRoom, params: SkillDeliveryParams): void {
        const { owner, skill, hit, aim } = params;
        const { x: originX, y: originY } = offsetSkillOrigin(
            params.originX,
            params.originY,
            hit.direction,
            hit.event
        );
        const area = hit.event.area;
        if (!area) {
            console.warn(`[Skill] ${skill.code}: AREA hit event without area config`);
            return;
        }

        // Tâm vùng = chân mục tiêu, kéo về trong castRange; không có mục tiêu → trước mặt.
        let x = originX + (hit.direction === "left" ? -1 : 1) * area.untargetedDistance;
        let y = originY;
        if (aim) {
            const dx = aim.x - originX;
            const dy = aim.y - originY;
            const length = Math.hypot(dx, dy);
            const scale =
                skill.castRange > 0 && length > skill.castRange ? skill.castRange / length : 1;
            x = originX + dx * scale;
            y = originY + dy * scale;
        }
        x = Math.min(Math.max(x, 0), room.map.width);
        y = Math.min(Math.max(y, 0), room.map.height);

        const delayTicks = area.delayMs > 0 ? millisecondsToTicks(area.delayMs, room.tickRate) : 0;
        const id = this.newId("a");
        const state = new AreaWorldState({
            id,
            owner,
            skillId: skill.id,
            hit,
            x,
            y,
            ticksUntilImpact: delayTicks,
        });
        // Vùng kéo dài: gây damage mỗi `tickMs` từ lần đầu (sau `delayMs`) cho tới hết `durationMs`.
        if (area.durationMs) {
            state.pulseEvery = millisecondsToTicks(area.tickMs ?? 1000, room.tickRate);
            const durationTicks = millisecondsToTicks(area.durationMs, room.tickRate);
            state.pulsesLeft =
                Math.floor(Math.max(0, durationTicks - delayTicks) / state.pulseEvery) + 1;
        }
        room.state.areas.set(id, state);
    }

    private resolveArea(room: WorldRoom, area: AreaWorldState): void {
        // Vùng là shape của event đặt tại tâm vùng (không phụ thuộc hướng).
        // Chỗ vùng đã tính offset lúc đặt (spawnArea): đo tại tâm vùng, không dời lần nữa.
        const event: SkillHitEvent = { ...area.event, offsetX: 0, offsetY: 0 };
        const origin = { x: area.x, y: area.y, direction: "right" };
        for (const target of findSkillTargets(room, area.owner)) {
            if (intersectsSkillHitEvent(origin, target.x, target.y, target.hitbox, event)) {
                applySkillHit(room, area.owner, target.id, area);
            }
        }
    }

    private newId(prefix: string): string {
        this.nextId = (this.nextId + 1) % Number.MAX_SAFE_INTEGER;
        return `${prefix}${this.nextId.toString(36)}`;
    }
}

/** Thân đạn: hình tròn bán kính `radius` quanh vị trí đạn. */
const projectileBody = (projectile: ProjectileWorldState): SkillHitEvent => ({
    ...projectile.event,
    offsetX: 0,
    offsetY: 0,
    shape: HitShape.CIRCLE,
    range: 0,
    radius: projectile.radius,
});

export const skillDeliveryWorldService = new SkillDeliveryWorldService();

/**
 * Vùng elip của vùng buff làm hit event để dùng chung `intersectsSkillHitEvent` (đường kính = 2 × nửa trục) và để tính damage
 * phép (`damageScaling` × MAGIC_ATTACK) — chỉ có hiệu ứng DAMAGE khi `damageScaling` > 0.
 */
function auraZoneEvent(aura: AuraWorldState, damageScaling: number): SkillHitEvent {
    return {
        eventIndex: aura.eventIndex,
        triggerTicks: 0,
        shape: HitShape.ELLIPSE,
        range: 0,
        width: aura.radiusX * 2,
        height: aura.radiusY * 2,
        radius: 0,
        angle: 90,
        effects:
            damageScaling > 0
                ? [
                      {
                          effectType: SkillEffectType.DAMAGE,
                          baseValue: 0,
                          scalingType: DamageScalingType.MAGIC_ATTACK,
                          scalingValue: damageScaling,
                          durationMs: 0,
                          damageType: DamageType.MAGICAL,
                          resourceType: ResourceType.NONE,
                          crowdControlType: CrowdControlType.NONE,
                      },
                  ]
                : [],
        delivery: HitDelivery.AURA,
    };
}

/** Vùng elip của hit ALLIES làm hit event để dùng chung `intersectsSkillHitEvent` (đường kính = 2 × nửa trục). */
function alliesZoneEvent(allies: SkillAllies, eventIndex: number): SkillHitEvent {
    return {
        eventIndex,
        triggerTicks: 0,
        shape: HitShape.ELLIPSE,
        range: 0,
        width: allies.radiusX * 2,
        height: allies.radiusY * 2,
        radius: 0,
        angle: 90,
        effects: [],
        delivery: HitDelivery.ALLIES,
    };
}
