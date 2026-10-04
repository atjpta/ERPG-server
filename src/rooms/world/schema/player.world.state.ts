import { ArraySchema, Schema, type } from "@colyseus/schema";

import { StatKey } from "@/modules/player/enums/stat.enum.js";
import {
    PlayerStatService,
    playerStatService,
} from "@/modules/player/user/services/player-stat.service.js";
import type { PlayerSnapshot } from "@/modules/player/user/services/player.service.js";
import type { PlayerState } from "@/modules/player/entities/player-state.entity.js";
import type { Wallet } from "@/modules/player/schemas/wallet.schema.js";
import { levelService } from "@/modules/levels/services/level.service.js";
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
    /** Thứ tự = thứ tự cột `skills`; các skill MELEE là combo đánh thường. */
    @type([OwnedSkillState]) skills = new ArraySchema<OwnedSkillState>();
    /** Exp tích luỹ trong level hiện tại / exp cần để lên level kế (0 = level tối đa). */
    @type("uint32") exp = 0;
    @type("uint32") expToNextLevel = 0;

    // Không đồng bộ xuống client (không có @type) — chỉ để lưu DB.
    wallet: Wallet;
    attributePoints: number;
    skillPoints: number;
    maxMp: number;

    constructor(props: { player: PlayerSnapshot }) {
        const { player } = props;
        super();
        this.id = player.id;
        this.name = player.name;
        this.level = player.level;
        this.x = player.x;
        this.y = player.y;
        this.direction = player.direction === "left" ? "left" : "right";
        // Stat tính từ class + điểm đã cộng + trang bị đang mặc (không lưu DB).
        const { stats } = playerStatService.compute(player);
        this.maxHp = PlayerStatService.whole(stats, StatKey.MAX_HP);
        this.maxMp = PlayerStatService.whole(stats, StatKey.MAX_MP);
        this.hp = this.maxHp;
        this.mp = player.mp;
        this.moveSpeed = stats[StatKey.MOVE_SPEED] ?? 0;
        this.attack = PlayerStatService.whole(stats, StatKey.PHYSICAL_ATTACK);
        this.defense = PlayerStatService.whole(stats, StatKey.PHYSICAL_DEFENSE);
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
    }

    setLevelProgress(level: number, exp: number) {
        this.level = level;
        this.exp = exp;
        this.expToNextLevel = levelService.getExpToNext(level) ?? 0;
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
        this.stateRevision = player.stateRevision;
        this.moving = false;
    }

    setStateRevision(revision: number) {
        this.stateRevision = revision;
    }
}
