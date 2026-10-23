import { MonsterStatus } from "@/modules/monsters/enums/monster-status.enum.js";
import { Monster } from "@/modules/monsters/entities/monster.entity.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";
import type { MonsterSpawn } from "@/modules/maps/types/game-map.type.js";
import type { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import type { Stats } from "@/modules/player/schemas/stat.schema.js";
import { monsterStatService } from "@/modules/monsters/services/monster-stat.service.js";
import type { MonsterVariant } from "@/modules/monsters/types/monster-stat.type.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { DamageCombatant } from "@/modules/combat/chains/damage.chain.js";
import type { MonsterDrops } from "@/modules/monsters/schemas/monster-drop.schema.js";
import { Direction } from "@/modules/player/enums/player.enum.js";
import { ArraySchema, Schema, type } from "@colyseus/schema";
import { v7 as uuidv7 } from "uuid";
import { scaleCollisionBounds } from "@/core/utils/collision-bounds.util.js";
import { HitboxColliderState } from "@/modules/combat/state/hitbox-collider.state.js";
import { OwnedSkillState, toOwnedSkillStates } from "@/modules/skills/state/owned-skill.state.js";

export class MonsterWorldState extends Schema {
    @type("string") id: string;
    @type("string") MonsterId: string;
    @type("string") code: string;
    @type("uint16") level: number;
    /** Loại (normal/elite/boss) — client ghi `[Elite]` / `[Boss]` trước tên. */
    @type("string") monsterType: MonsterType = MonsterType.NORMAL;
    /** Độ hiếm — client tô màu tên theo rarity. */
    @type("string") rarity: ItemRarity = ItemRarity.COMMON;
    /** Kích thước (`size` của `monster_scale_config`) — client phóng sprite; hitbox/collider/vùng đánh đã nhân sẵn. */
    @type("float32") scale = 1;
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
    /** Tick còn lại của choáng (skill có hiệu ứng STUN): đứng im, không đi không đánh; client giữ nguyên anim đang chạy. 0 = không choáng. */
    @type("uint16") stunTicks: number = 0;
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
    biome: Biome;
    /** Monster gốc + spawn của map: hồi sinh roll lại loại / độ hiếm / level từ đây. */
    readonly definition: Monster;
    readonly spawn: MonsterSpawn;
    /** Tăng mỗi đòn đánh — một phần seed roll combat (`combatSeed`). */
    attackSerial = 0;
    /** Số tick liên tiếp chưa nhận sát thương (về 0 khi bị đánh) — chain hồi máu dùng cho spawn có `healAfterIdleSec`. */
    idleTicks = 0;
    /** Đang bị đẩy lùi (skill có hiệu ứng KNOCKBACK): số tick còn lại và độ dời mỗi tick (ô). Vị trí đồng bộ qua x / y như bình thường. */
    knockbackTicks = 0;
    knockbackStepX = 0;
    knockbackStepY = 0;

    constructor(props: {
        monster: Monster;
        spawn: MonsterSpawn;
        variant: MonsterVariant;
        level: number;
        x: number;
        y: number;
    }) {
        const { monster, spawn, variant, level, x, y } = props;
        super();
        this.id = uuidv7();
        this.MonsterId = monster.id;
        this.code = monster.code;
        this.definition = monster;
        this.spawn = spawn;
        this.x = x;
        this.y = y;
        this.spawnX = x;
        this.spawnY = y;
        this.applyVariant(variant, level);
        this.attackCooldownMs = monster.attackCooldownMs;
        this.attackCooldownTicks = 0;
        this.skills.push(...toOwnedSkillStates(monster.skills));
        this.drops = monster.drops;
        this.biome = monster.biome;
    }

    /** Đặt loại / độ hiếm / level (sinh lần đầu và mỗi lần hồi sinh) rồi tính lại chỉ số, kích thước, máu. */
    applyVariant(variant: MonsterVariant, level: number) {
        const monster = this.definition;
        this.level = level;
        this.monsterType = variant.type;
        this.rarity = variant.rarity;
        const scales = monsterStatService.monsterScales(
            variant,
            masterDataCacheService.get(MasterDataKey.MONSTER_SCALE_CONFIG)
        );
        this.scale = monsterStatService.combineSize(scales);
        // Stat cuối = base × tăng theo level (`monster_level_config`) × hệ số loại × độ hiếm (cùng bộ StatKey với player).
        this.stats = monsterStatService.computeMonsterStats(
            monster,
            level,
            masterDataCacheService.get(MasterDataKey.MONSTER_LEVEL_CONFIG),
            scales
        );
        this.maxHp = Math.floor(this.stats[StatKey.MAX_HP] ?? 0);
        this.hp = this.maxHp;
        this.attack = Math.floor(this.stats[StatKey.PHYSICAL_ATTACK] ?? 0);
        this.defense = Math.floor(this.stats[StatKey.PHYSICAL_DEFENSE] ?? 0);
        this.moveSpeed = this.stats[StatKey.MOVE_SPEED] ?? 0;
        this.hitbox = new HitboxColliderState(scaleCollisionBounds(monster.hitbox, this.scale));
        this.collider = new HitboxColliderState(scaleCollisionBounds(monster.collider, this.scale));
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
        this.stunTicks = 0;
        this.knockbackTicks = 0;
        this.status = MonsterStatus.DEAD;
        this.clearAggroTarget();
        this.moving = false;
        this.attacking = false;
        this.hitInterrupted = false;
        this.hp = 0;
    }

    /** Choáng thêm `ticks` tick (không cộng dồn: lấy lần dài hơn). Huỷ đòn đang vung và dừng di chuyển ngay. */
    stun(ticks: number) {
        this.stunTicks = Math.min(0xffff, Math.max(this.stunTicks, Math.floor(ticks)));
        this.moving = false;
        this.attacking = false;
    }

    /**
     * Đẩy lùi theo vector đơn vị (dirX, dirY) đủ `distance` ô trong `ticks` tick; mục tiêu choáng suốt lúc bị đẩy
     * (MonsterStunChain dời vị trí mỗi tick). Đẩy mới thay đẩy đang chạy.
     */
    knockback(dirX: number, dirY: number, distance: number, ticks: number) {
        const count = Math.max(1, Math.floor(ticks));
        this.knockbackTicks = count;
        this.knockbackStepX = (dirX * distance) / count;
        this.knockbackStepY = (dirY * distance) / count;
        this.stun(count);
    }

    setSpawns() {
        this.status = MonsterStatus.ALIVE;
        this.stunTicks = 0;
        this.knockbackTicks = 0;
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

    /** Trúng đòn chỉ trừ máu: không khựng, không huỷ đòn đang đánh hay di chuyển. */
    takeDamage(damage: number) {
        this.hp = Math.max(0, this.hp - Math.max(0, damage));
        this.idleTicks = 0;
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
