/**
 * So giá trị master data trang bị do seed-data (tính bằng `calc`) với giá trị đang lưu trong DB (seed bằng code cũ dùng Big trực tiếp):
 * `yarn tsx scripts/check-seed-calc.ts`. Khác nhau → in key khác và thoát mã 1.
 */
import { connectPostgres } from "@/configs/postgres.config.js";
import { MasterDataRepo } from "@/modules/master-data/repositories/master-data.repository.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import {
    DEFAULT_EQUIPMENT_DISASSEMBLE_CONFIG,
    DEFAULT_EQUIPMENT_DROP_CONFIG,
    DEFAULT_EQUIPMENT_ENHANCE_CONFIG,
    DEFAULT_EQUIPMENT_REFINE_CONFIG,
    DEFAULT_EQUIPMENT_SET_CONFIG,
    DEFAULT_EQUIPMENT_STAT_CONFIG,
} from "@/modules/equipment/seeds/equipment-config.seed-data.js";

/** JSON với khoá sắp xếp (jsonb của Postgres không giữ thứ tự khoá). */
const canonical = (value: unknown): string =>
    JSON.stringify(value, (_key, item: unknown) =>
        item && typeof item === "object" && !Array.isArray(item)
            ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
            : item
    );

await connectPostgres();
const expected: [MasterDataKey, unknown][] = [
    [MasterDataKey.EQUIPMENT_STAT_CONFIG, DEFAULT_EQUIPMENT_STAT_CONFIG],
    [MasterDataKey.EQUIPMENT_SET_CONFIG, DEFAULT_EQUIPMENT_SET_CONFIG],
    [MasterDataKey.EQUIPMENT_ENHANCE_CONFIG, DEFAULT_EQUIPMENT_ENHANCE_CONFIG],
    [MasterDataKey.EQUIPMENT_REFINE_CONFIG, DEFAULT_EQUIPMENT_REFINE_CONFIG],
    [MasterDataKey.EQUIPMENT_DISASSEMBLE_CONFIG, DEFAULT_EQUIPMENT_DISASSEMBLE_CONFIG],
    [MasterDataKey.EQUIPMENT_DROP_CONFIG, DEFAULT_EQUIPMENT_DROP_CONFIG],
];
let different = 0;
for (const [key, value] of expected) {
    const row = await MasterDataRepo.findByKey({ key });
    const same = canonical(row?.value) === canonical(value);
    console.info(`${same ? "✅" : "❌"} ${key}`);
    if (!same) different++;
}
process.exit(different === 0 ? 0 : 1);
