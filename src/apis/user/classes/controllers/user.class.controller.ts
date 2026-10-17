import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { userClassService } from "@/apis/user/classes/services/user.class.service.js";

const prefix = "/classes";

export const userClassController = {
    /** Public — mọi class (cây chuyển cấp + class mặc được đồ). */
    userClassIndex: createEndpoint(prefix, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            return Response.ok({ data: userClassService.listAll() });
        })
    ),

    /** Public — class chọn được lúc tạo nhân vật (chỉ số nền, attribute, skill). */
    userClassStarterIndex: createEndpoint(`${prefix}/starter`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            return Response.ok({ data: userClassService.listStarter() });
        })
    ),
};
