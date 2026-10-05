import { MonsterStatus } from "@/modules/monsters/enums/monster-status.enum.js";
import { Monster } from "@/modules/monsters/entities/monster.entity.js";
import type { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";
import type { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import type { Stats } from "@/modules/player/schemas/stat.schema.js";
import { computeMonsterStats, monsterScales } from "@/modules/monsters/utils/monster-stat.util.js";
import type { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/user/services/master-data-cache.service.js";
import type { DamageCombatant } from "@/rooms/world/chains/damage.world.chain.js";
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

    // Không đồng bộ xuống client.
    /** Bảng rơi đồ của loại monster. */
    drops: MonsterDrops;
    /** Toàn bộ chỉ số ở level hiện tại (`computeMonsterStats`) — dùng cho chain tính damage. */
    stats: Stats;
    monsterType: MonsterType;
    rarity: ItemRarity;
    biome: Biome;
    /** Tăng mỗi đòn đánh — một phần seed roll combat (`combatSeed`). */
    attackSerial = 0;

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
        // Stat cuối = (cố định + tăng theo level) × hệ số loại × độ hiếm (cùng bộ StatKey với player).
        this.stats = computeMonsterStats(
            monster,
            monster.level,
            monsterScales(monster, masterDataCacheService.get(MasterDataKey.MONSTER_SCALE_CONFIG))
        );
        this.maxHp = Math.floor(this.stats[StatKey.MAX_HP] ?? 0);
        this.hp = this.maxHp;
        this.attack = Math.floor(this.stats[StatKey.PHYSICAL_ATTACK] ?? 0);
        this.defense = Math.floor(this.stats[StatKey.PHYSICAL_DEFENSE] ?? 0);
        this.moveSpeed = this.stats[StatKey.MOVE_SPEED] ?? 0;
        this.attackCooldownMs = monster.attackCooldownMs;
        this.attackCooldownTicks = 0;
        this.hitbox = new HitboxColliderState(monster.hitbox);
        this.collider = new HitboxColliderState(monster.collider);
        this.skills.push(...toOwnedSkillStates(monster.skills));
        this.drops = monster.drops;
        this.monsterType = monster.type;
        this.rarity = monster.rarity;
        this.biome = monster.biome;
    }

    toDamageCombatant(): DamageCombatant {
        return {
            id: this.id,
            stats: this.stats,
            hp: this.hp,
            maxHp: this.maxHp,
            monsterType: this.monsterType,
        };
    }

    heal(amount: number) {
        if (this.hp <= 0 || amount <= 0) return;
        this.hp = Math.min(this.maxHp, this.hp + Math.floor(amount));
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
