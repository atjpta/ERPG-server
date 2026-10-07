export enum SkillType {
    MELEE = "MELEE",
    PROJECTILE = "PROJECTILE",
    GROUND = "GROUND",
    AOE = "AOE",
    BUFF = "BUFF",
    DEBUFF = "DEBUFF",
    HEAL = "HEAL",
    SUMMON = "SUMMON",
    DASH = "DASH",
    PASSIVE = "PASSIVE",
}

export enum SkillOwnerType {
    MONSTER = "MONSTER",
    CLASS = "CLASS",
}

export enum TargetType {
    NONE = "NONE",
    SELF = "SELF",
    TARGET = "TARGET",
    POSITION = "POSITION",
    DIRECTION = "DIRECTION",
    ALLY = "ALLY",
    ENEMY = "ENEMY",
}

export enum HitShape {
    RECT = "RECT",
    CIRCLE = "CIRCLE",
    ARC = "ARC",
    CAPSULE = "CAPSULE",
    LINE = "LINE",
}

/**
 * Cách một hit event chạm mục tiêu: HITBOX = vùng quanh người đánh nổ ngay (cận chiến); PROJECTILE =
 * bắn ra một viên đạn bay, trúng khi chạm hitbox mục tiêu; AREA = vùng tròn đặt tại vị trí mục tiêu,
 * nổ sau `area.delayMs`.
 */
export enum HitDelivery {
    HITBOX = "HITBOX",
    PROJECTILE = "PROJECTILE",
    AREA = "AREA",
}

export enum SkillEffectType {
    DAMAGE = "DAMAGE",
    HEAL = "HEAL",
    APPLY_STATUS = "APPLY_STATUS",
    REMOVE_STATUS = "REMOVE_STATUS",
    KNOCKBACK = "KNOCKBACK",
    PULL = "PULL",
    DASH = "DASH",
    TELEPORT = "TELEPORT",
    SPAWN_PROJECTILE = "SPAWN_PROJECTILE",
    SUMMON = "SUMMON",
}

export enum DamageType {
    PHYSICAL = "PHYSICAL",
    MAGICAL = "MAGICAL",
    TRUE = "TRUE",
}

export enum DamageScalingType {
    NONE = "NONE",
    ATTACK = "ATTACK",
    MAGIC_ATTACK = "MAGIC_ATTACK",
    MAX_HP = "MAX_HP",
    CURRENT_HP = "CURRENT_HP",
    MISSING_HP = "MISSING_HP",
    DEFENSE = "DEFENSE",
    MAGIC_DEFENSE = "MAGIC_DEFENSE",
}

export enum ResourceType {
    NONE = "NONE",
    MANA = "MANA",
    STAMINA = "STAMINA",
    ENERGY = "ENERGY",
    HP = "HP",
}

export enum StatusEffectType {
    BUFF = "BUFF",
    DEBUFF = "DEBUFF",
    DOT = "DOT",
    HOT = "HOT",
    CONTROL = "CONTROL",
}

export enum CrowdControlType {
    NONE = "NONE",
    STUN = "STUN",
    ROOT = "ROOT",
    SLOW = "SLOW",
    SILENCE = "SILENCE",
    KNOCKBACK = "KNOCKBACK",
    KNOCKUP = "KNOCKUP",
    PULL = "PULL",
    FEAR = "FEAR",
    TAUNT = "TAUNT",
}

export enum TargetRelation {
    SELF = "SELF",
    ALLY = "ALLY",
    ENEMY = "ENEMY",
    NEUTRAL = "NEUTRAL",
}

export enum TargetEntityType {
    PLAYER = "PLAYER",
    MONSTER = "MONSTER",
    BOSS = "BOSS",
    NPC = "NPC",
    SUMMON = "SUMMON",
}

export enum ProjectileMovementType {
    STRAIGHT = "STRAIGHT",
    HOMING = "HOMING",
    ARC = "ARC",
    STATIONARY = "STATIONARY",
}

export enum ProjectileHitBehavior {
    DESTROY = "DESTROY",
    PIERCE = "PIERCE",
    BOUNCE = "BOUNCE",
    EXPLODE = "EXPLODE",
}

export enum CastType {
    INSTANT = "INSTANT",
    CAST = "CAST",
    CHANNEL = "CHANNEL",
}

export enum CastInterruptReason {
    MOVEMENT = "MOVEMENT",
    DAMAGE = "DAMAGE",
    STUN = "STUN",
    SILENCE = "SILENCE",
    DEATH = "DEATH",
    CANCEL = "CANCEL",
}

export enum SkillState {
    IDLE = "IDLE",
    WINDUP = "WINDUP",
    ACTIVE = "ACTIVE",
    RECOVERY = "RECOVERY",
    CHANNELING = "CHANNELING",
    CANCELLED = "CANCELLED",
    FINISHED = "FINISHED",
}
