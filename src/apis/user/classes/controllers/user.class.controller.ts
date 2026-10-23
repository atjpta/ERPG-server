import { createEndpoint } from "colyseus";
import { HttpResponse, RouterContainer } from "@/core/utils/response.util.js";
import { userClassService } from "@/apis/user/classes/services/user.class.service.js";
import { z } from "zod";
import { UserClassResponse } from "@/apis/user/player/validators/user.player.response.js";

const prefix = "/classes";

export const userClassController = {
    /** Public — mọi class (cây chuyển cấp + class mặc được đồ). */
    userClassIndex: createEndpoint(
        prefix,
        {
            method: "GET",
            sdk: {
                summary: "Mọi class (cây chuyển cấp và class mặc được đồ).",
                auth: "none",
                response: z.array(UserClassResponse),
            },
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                return HttpResponse.ok({ data: userClassService.listAll() });
            })
    ),

    /** Public — class chọn được lúc tạo nhân vật (chỉ số nền, attribute, skill). */
    userClassStarterIndex: createEndpoint(
        `${prefix}/starter`,
        {
            method: "GET",
            sdk: {
                summary: "Class chọn được lúc tạo nhân vật (chỉ số nền, attribute, skill).",
                auth: "none",
                response: z.array(UserClassResponse),
            },
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                return HttpResponse.ok({ data: userClassService.listStarter() });
            })
    ),
};
