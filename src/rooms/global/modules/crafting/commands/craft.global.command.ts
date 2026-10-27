import { CommonCode } from "@/core/enums/common-code.enum.js";
import { Response } from "@/core/response/response.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { CraftingErrorCode } from "@/modules/crafting/enums/crafting-error-code.enum.js";
import { craftingService } from "@/modules/crafting/services/crafting.service.js";
import { recipeService } from "@/modules/crafting/services/recipe.service.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { NpcErrorCode } from "@/modules/npcs/enums/npc-error-code.enum.js";
import { NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
import type { CraftResultMessage } from "@/rooms/global/modules/crafting/interfaces/crafting.global.message.js";
import {
    CraftSchema,
    type CraftBody,
} from "@/rooms/global/modules/crafting/validators/crafting.validator.js";
import { InventoryGlobalCommand } from "@/rooms/global/modules/inventory/commands/inventory.global.command.js";
import { inventoryGlobalService } from "@/rooms/global/modules/inventory/services/inventory.global.service.js";
import type { PlayerWorldView } from "@/rooms/global/modules/player-data/types/player-data.type.js";
import { npcFunctionGlobalService } from "@/rooms/global/modules/npc-function/services/npc-function.global.service.js";
import { GlobalClientMessage, GlobalMessage } from "@/rooms/global/types/global-message.type.js";

@SdkMessage({
    response: "CraftResultMessage",
    replies: [GlobalMessage.INVENTORY_CHANGED],
    errors: [
        CommonCode.INVALID_INPUT,
        NpcErrorCode.NPC_FUNCTION_NOT_OPEN,
        PlayerErrorCode.TOO_FAR,
        PlayerErrorCode.LEVEL_TOO_LOW,
        CraftingErrorCode.RECIPE_NOT_FOUND,
        CraftingErrorCode.RECIPE_NOT_AVAILABLE,
        CraftingErrorCode.CRAFT_QUANTITY_TOO_HIGH,
        ItemErrorCode.ITEM_NOT_ENOUGH,
        ItemErrorCode.CURRENCY_NOT_ENOUGH,
        ItemErrorCode.INVENTORY_FULL,
    ],
    note: "Chỉ chạy khi đang mở chức năng `crafting` của NPC (`npcFunctionOpen`) và còn đứng gần; công thức phải thuộc nhóm mà chức năng đó giữ. Thành công: nguyên liệu + tiền bị trừ, item vào túi (chi tiết đến qua `inventoryChanged`); lỗi nào cũng không đổi gì.",
})
export class CraftGlobalCommand extends InventoryGlobalCommand<
    typeof CraftSchema,
    CraftResultMessage
> {
    static readonly message = GlobalClientMessage.CRAFT;

    protected readonly validateSchema = CraftSchema;

    /** Cổng NPC + công thức thuộc nhóm đang mở + số lượng, rồi mới chế (nguyên tử trong `transact` của lớp cha). */
    override async execute(payload: { client: PlayerClient; payload: unknown }) {
        const open = await npcFunctionGlobalService.require(this.player, NpcFunctionType.CRAFTING);
        if (Response.isError(open)) {
            this.result = open;
            return;
        }
        const { recipeCode, quantity } = this.body;
        const recipe = recipeService.getByCode(recipeCode);
        if (!recipe) {
            this.result = Response.error(CraftingErrorCode.RECIPE_NOT_FOUND);
            return;
        }
        if (!recipeService.isOffered(recipe, open.data.recipeGroups)) {
            this.result = Response.error(CraftingErrorCode.RECIPE_NOT_AVAILABLE);
            return;
        }
        const { maxQuantity } = masterDataCacheService.get(MasterDataKey.CRAFTING_CONFIG);
        if (quantity > maxQuantity) {
            this.result = Response.error(CraftingErrorCode.CRAFT_QUANTITY_TOO_HIGH, {
                max: maxQuantity,
            });
            return;
        }
        await super.execute(payload);
    }

    protected run(
        player: PlayerState,
        { recipeCode, quantity }: CraftBody,
        world: PlayerWorldView
    ) {
        const recipe = recipeService.getByCode(recipeCode)!;
        const crafted = craftingService.craft({
            bag: player.bag,
            wallet: world.wallet,
            level: world.level,
            recipe,
            quantity,
        });
        if (Response.isError(crafted)) return crafted;
        world.wallet = crafted.data.wallet;
        return Response.success<CraftResultMessage>({
            recipeCode,
            quantity,
            items: crafted.data.items.map((item) =>
                inventoryGlobalService.toItemRewardMessage(item)
            ),
        });
    }

    protected override toResponse(value: CraftResultMessage) {
        return value;
    }
}
