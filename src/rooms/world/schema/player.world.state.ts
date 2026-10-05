import { ArraySchema, Schema, type } from "@colyseus/schema";

import { big, floorBig, roundBig } from "@/core/utils/big-number.util.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import {
    PlayerStatService,
    playerStatService,
} from "@/modules/player/user/services/player-stat.service.js";
import type { PlayerSnapshot } from "@/modules/player/user/services/player.service.js";
import type { PlayerState } from "@/modules/player/entities/player-state.entity.js";
import type { Wallet } from "@/modules/player/schemas/wallet.schema.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { levelService } from "@/modules/levels/services/level.service.js";
import {
    fromInventories,
    toInventories,
    type Equipments,
    type Inventories,
} from "@/modules/player/schemas/inventory.schema.js";
import type { AttributeKey, Attributes, Stats } from "@/modules/player/schemas/stat.schema.js";
import { allocateAttributePoints } from "@/modules/player/utils/player-progress.util.js";
import type { AttributeSummary } from "@/rooms/world/world.message.js";
import type { DamageCombatant } from "@/rooms/world/chains/damage.world.chain.js";
import { HitboxColliderState } from "@/rooms/world/schema/hitbox-collider.world.state.js";
import {
    OwnedSkillState,
    toOwnedSkillStates,
} from "@/rooms/world/schema/owned-skill.world.state.js";

/** Player hiển thị trên map — chỉ chứa dữ liệu mọi người chơi khác cần thấy. */
export class PlayerWorldState extends Schema {
    @type("string") id: string;
    @type("string") name: string;
    @type("uint16") level: number;
    @type("float32") x: number;
    @type("float32") y: number;
    @type("string") direction: string;
    @type("boolean") moving: boolean = false;
    @type("uint32") hp: number;
    @type("uint32") maxHp: number;
    @type("uint32") mp: number;
    @type("uint32") maxMp: number;
    @type("float32") moveSpeed: number;
    @type("uint32") attack: number;
    @type("uint32") defense: number;
    @type("uint32") stateRevision: number;
    @type("uint8") attackCooldownTicks: number = 0;
    @type("boolean") dashing: boolean = false;
    @type("uint8") dashTicks: number = 0;
    @type("uint8") dashCooldownTicks: number = 0;
    @type("boolean") attacking: boolean = false;
    @type("uint8") attackCombo: number = 0;
    @type("boolean") hitInterrupted: boolean = false;
    @type(HitboxColliderState) hitbox: HitboxColliderState;
    @type(HitboxColliderState) collider: HitboxColliderState;
    @type("string") targetId = "";
    @type("boolean") targetLocked = false;
    @type([OwnedSkillState]) skills = new ArraySchema<OwnedSkillState>();
    @type("uint32") exp = 0;
    @type("uint32") expToNextLevel = 0;
    /** Code class hiện tại và class tier 1 gốc của nó (client chọn hình/animation theo class). */
    @type("string") classCode = "";
    @type("string") baseClassCode = "";

    wallet: Wallet;
    attributePoints: number;
    classId: string;
    allocatedAttributes: Attributes;
    equipments: Equipments;
    /** 3 túi inventory theo ItemType (server-only, gửi client qua message `inventory`). */
    inventories: Inventories;
    attributes: Attributes;
    stats: Stats;
    /** Tăng mỗi đòn đánh — một phần seed roll combat (`combatSeed`). */
    attackSerial = 0;
    skillPoints: number;
    /** Phần HP/MP hồi lẻ (< 1) cộng dồn giữa các tick. */
    private hpRegenCarry = big(0);
    private mpRegenCarry = big(0);

    constructor(props: { player: PlayerSnapshot }) {
        const { player } = props;
        super();
        this.id = player.id;
        this.name = player.name;
        this.level = player.level;
        this.x = player.x;
        this.y = player.y;
        this.direction = player.direction === "left" ? "left" : "right";
        this.classId = player.classId;
        this.classCode = classService.getById(player.classId)?.code ?? "";
        this.baseClassCode = this.classCode ? classService.getBaseClassCode(this.classCode) : "";
        this.allocatedAttributes = { ...player.allocatedAttributes };
        this.equipments = structuredClone(player.equipments);
        this.inventories = structuredClone(toInventories(player));
        this.refreshStats();
        this.hp = this.maxHp;
        this.mp = player.mp;
        this.stateRevision = player.stateRevision;
        this.hitbox = new HitboxColliderState(player.hitbox);
        this.collider = new HitboxColliderState(player.collider);
        this.skills.push(...toOwnedSkillStates(player.skills));
        this.applyProgress(player);
    }

    /** Level, exp, ví tiền, điểm chưa dùng — từ DB (lúc vào room / sau khi đồng bộ lại). */
    private applyProgress(player: PlayerSnapshot) {
        this.setLevelProgress(player.level, player.exp);
        this.wallet = structuredClone(player.wallet);
        this.attributePoints = player.attributePoints;
        this.skillPoints = player.skillPoints;
        this.allocatedAttributes = { ...player.allocatedAttributes };
    }

    setLevelProgress(level: number, exp: number) {
        this.level = level;
        this.exp = exp;
        this.expToNextLevel = levelService.getExpToNext(level) ?? 0;
    }

    refreshStats() {
        const { attributes, stats } = playerStatService.compute(this);
        const previousMaxHp = this.maxHp ?? 0;
        const previousMaxMp = this.maxMp ?? 0;
        this.attributes = attributes;
        this.stats = stats;
        this.maxHp = PlayerStatService.whole(stats, StatKey.MAX_HP);
        this.maxMp = PlayerStatService.whole(stats, StatKey.MAX_MP);
        this.moveSpeed = stats[StatKey.MOVE_SPEED] ?? 0;
        this.attack = PlayerStatService.whole(stats, StatKey.PHYSICAL_ATTACK);
        this.defense = PlayerStatService.whole(stats, StatKey.PHYSICAL_DEFENSE);
        if (this.hp !== undefined && this.hp > 0) {
            this.hp = Math.min(this.maxHp, Math.max(1, this.hp + this.maxHp - previousMaxHp));
        }
        if (this.mp !== undefined) {
            this.mp = Math.min(this.maxMp, Math.max(0, this.mp + this.maxMp - previousMaxMp));
        }
    }

    /** Cộng điểm tiềm năng; trả lỗi (string) nếu không hợp lệ, `undefined` khi thành công. */
    allocateAttributes(request: Partial<Record<AttributeKey, number>>): string | undefined {
        const result = allocateAttributePoints(
            this.allocatedAttributes,
            this.attributePoints,
            request
        );
        if (typeof result === "string") return result;
        this.allocatedAttributes = result.allocatedAttributes;
        this.attributePoints = result.attributePoints;
        this.refreshStats();
        return undefined;
    }

    /** Kết quả nếu cộng điểm như `request` — không đổi state; trả lỗi (string) nếu không hợp lệ. */
    previewAttributes(request: Partial<Record<AttributeKey, number>>): AttributeSummary | string {
        const result = allocateAttributePoints(
            this.allocatedAttributes,
            this.attributePoints,
            request
        );
        if (typeof result === "string") return result;
        const { attributes, stats } = playerStatService.compute({
            classId: this.classId,
            allocatedAttributes: result.allocatedAttributes,
            equipments: this.equipments,
        });
        return {
            attributePoints: result.attributePoints,
            allocatedAttributes: { ...result.allocatedAttributes },
            attributes: { ...attributes },
            stats: { ...stats },
        };
    }

    getAttributeSummary(): AttributeSummary {
        return {
            attributePoints: this.attributePoints,
            allocatedAttributes: { ...this.allocatedAttributes },
            attributes: { ...this.attributes },
            stats: { ...this.stats },
        };
    }

    /** Hồi HP/MP theo `hp_regen`/`mp_regen` (mỗi giây) sau `dt` giây; chết thì không hồi. */
    regenerate(dt: number) {
        if (this.hp <= 0) {
            this.hpRegenCarry = big(0);
            this.mpRegenCarry = big(0);
            return;
        }
        this.hpRegenCarry = roundBig(
            this.hpRegenCarry.plus(big(this.stats[StatKey.HP_REGEN] ?? 0).times(dt))
        );
        this.mpRegenCarry = roundBig(
            this.mpRegenCarry.plus(big(this.stats[StatKey.MP_REGEN] ?? 0).times(dt))
        );
        const hpGain = floorBig(this.hpRegenCarry);
        const mpGain = floorBig(this.mpRegenCarry);
        this.hpRegenCarry = this.hpRegenCarry.minus(hpGain);
        this.mpRegenCarry = this.mpRegenCarry.minus(mpGain);
        if (hpGain > 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + hpGain);
        if (mpGain > 0 && this.mp < this.maxMp) this.mp = Math.min(this.maxMp, this.mp + mpGain);
    }

    /** Hồi đầy HP/MP (lên level). */
    restoreFull() {
        this.hp = this.maxHp;
        this.mp = this.maxMp;
    }

    /** Phần state được lưu xuống DB (checkpoint định kỳ và lúc rời room). */
    toSavedState(
        mapCode: string
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
    > {
        return {
            mapCode,
            x: this.x,
            y: this.y,
            direction: this.direction as PlayerState["direction"],
            hp: this.hp,
            mp: this.mp,
            level: this.level,
            exp: this.exp,
            wallet: structuredClone(this.wallet),
            attributePoints: this.attributePoints,
            skillPoints: this.skillPoints,
            allocatedAttributes: { ...this.allocatedAttributes },
            equipments: structuredClone(this.equipments),
            ...structuredClone(fromInventories(this.inventories)),
        };
    }

    /** Hồi sinh tại điểm spawn của map (`game_maps.spawnX/spawnY`). */
    setSpawns(spawnX: number, spawnY: number) {
        this.x = spawnX;
        this.y = spawnY;
        this.moving = false;
        this.attacking = false;
        this.attackCombo = 0;
        this.hitInterrupted = false;
        this.targetId = "";
        this.targetLocked = false;
        this.dashing = false;
        this.hp = this.maxHp;
        this.attackCooldownTicks = 0;
        this.dashTicks = 0;
        this.dashCooldownTicks = 0;
    }

    setDead() {
        this.hp = 0;
        this.moving = false;
        this.attacking = false;
        this.attackCombo = 0;
        this.hitInterrupted = false;
        this.targetId = "";
        this.targetLocked = false;
        this.dashing = false;
    }

    recoverPosition(spawnX: number, spawnY: number, width: number, height: number) {
        if (!Number.isFinite(this.x) || this.x < 0 || this.x > width) this.x = spawnX;
        if (!Number.isFinite(this.y) || this.y < 0 || this.y > height) this.y = spawnY;
    }

    startAttack(cooldownTicks: number) {
        this.attacking = true;
        this.attackCooldownTicks = cooldownTicks;
    }

    chainDash(requested: boolean, tickRate: number) {
        if (requested && this.dashCooldownTicks === 0 && this.dashTicks === 0) {
            this.dashTicks = Math.ceil((300 * tickRate) / 1000);
            this.dashCooldownTicks = Math.ceil((600 * tickRate) / 1000);
        }

        this.dashing = this.dashTicks > 0;
        if (this.dashTicks > 0) this.dashTicks--;
        if (this.dashCooldownTicks > 0) this.dashCooldownTicks--;
    }

    toDamageCombatant(): DamageCombatant {
        return { id: this.id, stats: this.stats, hp: this.hp, maxHp: this.maxHp };
    }

    heal(amount: number) {
        if (this.hp <= 0 || amount <= 0) return;
        this.hp = Math.min(this.maxHp, this.hp + Math.floor(amount));
    }

    takeDamage(damage: number) {
        if (this.dashing) return;

        this.hp = Math.max(0, this.hp - Math.max(0, damage));
        this.hitInterrupted = true;
        this.moving = false;
        this.attacking = false;
        this.attackCombo = 0;
        this.attackCooldownTicks = 0;
        this.dashing = false;
        this.dashTicks = 0;
    }

    syncSnapshot(player: PlayerSnapshot) {
        this.x = player.x;
        this.y = player.y;
        this.direction = player.direction === "left" ? "left" : "right";
        this.hp = player.hp;
        this.mp = player.mp;
        this.applyProgress(player);
        this.equipments = structuredClone(player.equipments);
        this.inventories = structuredClone(toInventories(player));
        this.refreshStats();
        this.stateRevision = player.stateRevision;
        this.moving = false;
    }

    setStateRevision(revision: number) {
        this.stateRevision = revision;
    }
}
