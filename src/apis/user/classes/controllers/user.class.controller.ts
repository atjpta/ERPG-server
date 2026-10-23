import { createEndpoint } from "colyseus";
import { HttpResponse, RouterContainer } from "@/core/response/http-response.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { toClassView } from "@/modules/classes/utils/class-view.util.js";
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
                return HttpResponse.success(classService.listAll().map(toClassView));
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
                return HttpResponse.success(classService.listStarter().map(toClassView));
            })
    ),
};
