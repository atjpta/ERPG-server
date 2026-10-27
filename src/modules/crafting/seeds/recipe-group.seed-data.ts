import type { NewRecipeGroup } from "@/modules/crafting/entities/recipe-group.entity.js";
import { RecipeGroupCode } from "@/modules/crafting/enums/recipe-group-code.enum.js";

/** Nhóm công thức. NPC chế tạo giữ danh sách code nhóm trong chức năng `crafting` (xem `npc.seed-data.ts`). */
export const RECIPE_GROUPS: NewRecipeGroup[] = [
    { code: RecipeGroupCode.SMITHING, sortOrder: 0 },
    { code: RecipeGroupCode.ALCHEMY, sortOrder: 1 },
];
