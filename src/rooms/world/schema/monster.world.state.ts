import { MonsterStatus } from "@/modules/monsters/enums/monster-status.enum.js";
import { Monster } from "@/modules/monsters/entities/monster.entity.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import type { MonsterDrops } from "@/modules/monsters/schemas/monster-drop.schema.js";
import { Direction } from "@/modules/player/enums/player.enum.js";
import { ArraySchema, Schema, type } from "@colyseus/schema";
import { v7 as uuidv7 } from "uuid";
import { HitboxColliderState } from "@/rooms/world/schema/hitbox-collider.world.state.js";
import {
    OwnedSkillState,
    toOwnedSkillStates,
} from "@/rooms/world/schema/owned-skill.world.state.js";

export class MonsterWorldState extends Schema {
    @type("string") id: string;
    @type("string") MonsterId: string;
    @type("string") code: string;
    @type("uint16") level: number;
    @type("float32") x: number;
    @type("float32") y: number;
    @type("float32") spawnX: number;
    @type("float32") spawnY: number;
    @type("string") direction: Direction = Direction.LEFT;
    @type("string") status: MonsterStatus = MonsterStatus.ALIVE;
    @type("boolean") moving: boolean = false;
    @type("boolean") attacking: boolean = false;
    @type("boolean") hitInterrupted: boolean = false;
    @type("uint32") hp: number;
    @type("uint32") maxHp: number;
    @type("uint32") attack: number;
    @type("uint32") defense: number;
    @type("float32") moveSpeed: number;
    @type("uint32") attackCooldownMs: number;
    @type("uint16") attackCooldownTicks: number = 0;
    @type(HitboxColliderState) hitbox: HitboxColliderState;
    @type(HitboxColliderState) collider: HitboxColliderState;
    @type("string") targetId = "";
    /** Skill MELEE đầu tiên là đòn đánh thường. */
    @type([OwnedSkillState]) skills = new ArraySchema<OwnedSkillState>();

    /** Bảng rơi đồ của loại monster (không đồng bộ xuống client). */
    drops: MonsterDrops;

    constructor(props: { monster: Monster; x: number; y: number }) {
        const { monster, x, y } = props;
        super();
        this.id = uuidv7();
        this.MonsterId = monster.id;
        this.code = monster.code;
        this.level = monster.level;
        this.x = x;
        this.y = y;
        this.spawnX = x;
        this.spawnY = y;
        // Chỉ số cố định của monster nằm trong cột `stats`.
        this.maxHp = Math.floor(monster.stats[StatKey.MAX_HP] ?? 0);
        this.hp = this.maxHp;
        this.attack = Math.floor(monster.stats[StatKey.PHYSICAL_ATTACK] ?? 0);
        this.defense = Math.floor(monster.stats[StatKey.PHYSICAL_DEFENSE] ?? 0);
        this.moveSpeed = monster.stats[StatKey.MOVE_SPEED] ?? 0;
        this.attackCooldownMs = monster.attackCooldownMs;
        this.attackCooldownTicks = 0;
        this.hitbox = new HitboxColliderState(monster.hitbox);
        this.collider = new HitboxColliderState(monster.collider);
        this.skills.push(...toOwnedSkillStates(monster.skills));
        this.drops = monster.drops;
    }

    setDead() {
        this.status = MonsterStatus.DEAD;
        this.clearAggroTarget();
        this.moving = false;
        this.attacking = false;
        this.hitInterrupted = false;
        this.hp = 0;
    }

    setSpawns() {
        this.status = MonsterStatus.ALIVE;
        this.clearAggroTarget();
        this.x = this.spawnX;
        this.y = this.spawnY;
        this.direction = Direction.LEFT;
        this.moving = false;
        this.attacking = false;
        this.hitInterrupted = false;
        this.hp = this.maxHp;
        this.attackCooldownTicks = 0;
    }

    faceTarget(dx: number) {
        this.moving = false;
        this.lookAt(dx);
    }

    lookAt(dx: number) {
        if (dx < 0) this.direction = Direction.LEFT;
        else if (dx > 0) this.direction = Direction.RIGHT;
    }

    startAttack(cooldownTicks: number) {
        this.attacking = true;
        this.attackCooldownTicks = cooldownTicks;
    }

    startAttackWindup() {
        this.moving = false;
        this.attacking = true;
    }

    takeDamage(damage: number, attackRecoveryTicks: number) {
        this.hp = Math.max(0, this.hp - Math.max(0, damage));
        this.hitInterrupted = true;
        this.moving = false;
        this.attacking = false;
        this.attackCooldownTicks = attackRecoveryTicks;
    }

    setAggroTarget(playerId: string) {
        this.targetId = playerId;
    }

    getAggroTargetId() {
        return this.targetId || null;
    }

    clearAggroTarget() {
        this.targetId = "";
    }
}
