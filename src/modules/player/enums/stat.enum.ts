export enum StatKey {
    STRENGTH = "strength", // physical_attack
    DEXTERITY = "dexterity", // evasion, accuracy
    INTELLIGENCE = "intelligence", // magic_attack, max_mp
    VITALITY = "vitality", // max_hp
    LUCK = "luck", // critical_hit_chance, critical_damage

    PHYSICAL_ATTACK = "physical_attack",
    MAGIC_ATTACK = "magic_attack",
    PHYSICAL_DEFENSE = "physical_defense",
    MAGIC_DEFENSE = "magic_defense",

    MAX_HP = "max_hp",
    MAX_MP = "max_mp",
    EVASION = "evasion",
    ACCURACY = "accuracy",
    CRITICAL_CHANCE = "critical_chance",
    CRITICAL_DAMAGE = "critical_damage",

    PHYSICAL_PENETRATION = "physical_penetration",
    MAGIC_PENETRATION = "magic_penetration",

    LIFE_STEAL = "life_steal",
    MOVE_SPEED = "move_speed",

    DAMAGE_TO_MONSTERS = "damage_to_monsters",
    DAMAGE_TO_BOSSES = "damage_to_bosses",

    EXP_BONUS = "exp_bonus",
    DROP_RATE = "drop_rate",
    GOLD_BONUS = "gold_bonus",

    // element
    // FIRE_DAMAGE
    // WATER_DAMAGE
    // EARTH_DAMAGE
    // WIND_DAMAGE
    // LIGHT_DAMAGE
    // DARK_DAMAGE
    // FIRE_RESISTANCE
    // WATER_RESISTANCE
    // EARTH_RESISTANCE
    // WIND_RESISTANCE
    // LIGHT_RESISTANCE
    // DARK_RESISTANCE
}

export enum StatType {
    FLAT = "flat",
    PERCENT = "percent", //(0 -> 1)
}

export enum StatSource {
    BASE = "base",
    EQUIPMENT = "equipment",
}
