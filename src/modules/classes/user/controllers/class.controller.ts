import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { classService } from "@/modules/classes/services/class.service.js";

const prefix = "/classes";

export const classController = {
    /** Public — class chọn được lúc tạo nhân vật (chỉ số nền, attribute, skill). */
    classStarterIndex: createEndpoint(`${prefix}/starter`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const classes = classService.listStarter().map((characterClass) => ({
                code: characterClass.code,
                name: characterClass.name,
                tier: characterClass.tier,
                baseAttributes: characterClass.baseAttributes,
                baseStats: characterClass.baseStats,
                skills: characterClass.skills,
            }));
            return Response.ok({ data: classes });
        })
    ),
};
