/** Skill gắn hiệu ứng (prefab `Resources/Prefabs/SkillEffects/<code của skill>`) lên các nhân vật này. */
export interface SkillEffectMessage {
    skillId: string;
    /** playerId của các người chơi nhận hiệu ứng. */
    playerIds: string[];
}
