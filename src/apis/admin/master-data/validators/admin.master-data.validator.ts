import { z } from "zod";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";

export const AdminMasterDataKeyParamSchema = z.object({
    key: z.enum(MasterDataKey),
});

/** `value` được validate tiếp theo đúng schema của từng key trong service (xem `MasterDataValueSchemas`). */
export const AdminUpdateMasterDataSchema = z.object({
    value: z.unknown(),
    note: z.string().max(500).optional(),
});
export type AdminUpdateMasterDataBody = z.infer<typeof AdminUpdateMasterDataSchema>;
