import { Schema, type } from "@colyseus/schema";
import type { OwnedSkill } from "@/modules/skills/schemas/skill-config.schema.js";

/** Một skill player/monster sở hữu — client tra `skills.json` theo `skillId`. */
export class OwnedSkillState extends Schema {
    @type("string") skillId: string;
    @type("uint8") level: number;

    constructor(skill: OwnedSkill) {
        super();
        this.skillId = skill.skillId;
        this.level = skill.level;
    }
}

export const toOwnedSkillStates = (skills: readonly OwnedSkill[]) =>
    skills.map((skill) => new OwnedSkillState(skill));
