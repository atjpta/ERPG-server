import { z } from "zod";
import { ItemCode } from "@/modules/items/enums/item-code.enum.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { ItemEquipmentInstanceMetadataSchema } from "@/modules/items/schemas/item-metadata.schema.js";
import { CurrencyRewardSchema } from "@/modules/rewards/schemas/currency-reward.schema.js";

const codeSchema = z.string().regex(/^[a-z0-9_]+$/);

/** Một nguyên liệu: `order` là thứ tự hiển thị trong công thức (client sắp theo đó), không ảnh hưởng cách trừ. */
export const RecipeIngredientSchema = z.object({
    itemCode: z.string().min(1),
    quantity: z.number().int().positive(),
    order: z.number().int().nonnegative(),
});
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

/**
 * Phần dữ liệu của một công thức (ngoài `code`). Trang bị tạo ra: có `resultMetadata` thì chỉ số cố định đúng như khai;
 * không có thì roll ngẫu nhiên theo `resultLevel` + `resultRarity` (như rơi đồ). Item xếp chồng thì không dùng cả ba field này.
 */
export const RecipeDefinitionSchema = z
    .object({
        /** Code nhóm (`crafting_recipe_groups.code`) chứa công thức này; NPC chế được công thức khi giữ ít nhất một nhóm trong số này. */
        groupCodes: z.array(codeSchema).min(1),
        sortOrder: z.number().int().default(0),
        /** Level tối thiểu của người chơi để chế. */
        requiredLevel: z.number().int().positive().default(1),
        resultItemCode: z.enum(ItemCode),
        /** Số item xếp chồng ra mỗi lần chế (trang bị luôn ra 1 món mỗi lần). */
        resultQuantity: z.number().int().positive().default(1),
        resultLevel: z.number().int().positive().nullish(),
        resultRarity: z.enum(ItemRarity).nullish(),
        /** Chỉ số cố định của trang bị tạo ra. */
        resultMetadata: ItemEquipmentInstanceMetadataSchema.nullish(),
        ingredients: z.array(RecipeIngredientSchema).default([]),
        cost: z.array(CurrencyRewardSchema).default([]),
    })
    .superRefine((recipe, ctx) => {
        const orders = new Set<number>();
        const codes = new Set<string>();
        recipe.ingredients.forEach((ingredient, index) => {
            if (orders.has(ingredient.order)) {
                ctx.addIssue({
                    code: "custom",
                    path: ["ingredients", index, "order"],
                    message: "duplicate order",
                });
            }
            if (codes.has(ingredient.itemCode)) {
                ctx.addIssue({
                    code: "custom",
                    path: ["ingredients", index, "itemCode"],
                    message: "duplicate item",
                });
            }
            orders.add(ingredient.order);
            codes.add(ingredient.itemCode);
        });
        const rolls = recipe.resultLevel != null || recipe.resultRarity != null;
        if (rolls && (recipe.resultLevel == null || recipe.resultRarity == null)) {
            ctx.addIssue({
                code: "custom",
                path: ["resultLevel"],
                message: "resultLevel and resultRarity go together",
            });
        }
        if (recipe.resultMetadata && rolls) {
            ctx.addIssue({
                code: "custom",
                path: ["resultMetadata"],
                message:
                    "resultMetadata (fixed stats) and resultLevel/resultRarity (rolled) are exclusive",
            });
        }
    });
export type RecipeDefinition = z.infer<typeof RecipeDefinitionSchema>;
export type RecipeDefinitionInput = z.input<typeof RecipeDefinitionSchema>;
