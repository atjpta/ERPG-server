import { createEndpoint } from "colyseus";
import type { CharacterClass } from "@/modules/classes/entities/class.entity.js";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { classService } from "@/modules/classes/services/class.service.js";

const prefix = "/classes";

const toClassView = (characterClass: CharacterClass) => ({
    code: characterClass.code,
    name: characterClass.name,
    tier: characterClass.tier,
    baseAttributes: characterClass.baseAttributes,
    baseStats: characterClass.baseStats,
    skills: characterClass.skills,
    /** Các hướng chuyển cấp (class con trực thuộc). */
    nextClassCodes: characterClass.nextClassCodes,
    nextClassRequiredLevel: characterClass.nextClassRequiredLevel,
    /** Đồ gắn các class này thì mặc được (client làm mờ đồ không mặc được). */
    usableItemClassCodes: classService.getUsableItemClassCodes(characterClass.code),
});

export const classController = {
    /** Public — mọi class (cây chuyển cấp + class mặc được đồ). */
    classIndex: createEndpoint(prefix, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            return Response.ok({ data: classService.listAll().map(toClassView) });
        })
    ),

    /** Public — class chọn được lúc tạo nhân vật (chỉ số nền, attribute, skill). */
    classStarterIndex: createEndpoint(`${prefix}/starter`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            return Response.ok({ data: classService.listStarter().map(toClassView) });
        })
    ),
};
