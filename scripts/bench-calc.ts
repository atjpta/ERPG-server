/**
 * So tốc độ hai driver `calc` trên đường nóng thật: `yarn tsx scripts/bench-calc.ts` (cần DB dev đã seed để nạp cache skill).
 * In số lần `calculateDamage` mỗi giây với từng driver.
 */
import { connectPostgres } from "@/configs/postgres.config.js";
import type { ICalcDriver } from "@/core/calc/calc.interface.js";
import { CalcService, calcService } from "@/core/calc/calc.service.js";
import { calculateDamage, type DamageCombatant } from "@/modules/combat/chains/damage.chain.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import { setCacheDataApp } from "@/cache-data/index.js";
import { skillService } from "@/modules/skills/services/skill.service.js";

await connectPostgres();
await setCacheDataApp();

const stats = (base: number) => ({
    [StatKey.PHYSICAL_ATTACK]: base,
    [StatKey.MAGIC_ATTACK]: base * 0.8,
    [StatKey.PHYSICAL_DEFENSE]: base * 0.5,
    [StatKey.MAGIC_DEFENSE]: base * 0.4,
    [StatKey.ACCURACY]: 120.5,
    [StatKey.EVASION]: 80.25,
    [StatKey.CRITICAL_CHANCE]: 0.15,
    [StatKey.CRITICAL_DAMAGE]: 1.75,
    [StatKey.LIFE_STEAL]: 0.05,
});
const attacker: DamageCombatant = { id: "a", stats: stats(900), hp: 5000, maxHp: 5000 };
const defender: DamageCombatant = { id: "d", stats: stats(600), hp: 90_000, maxHp: 90_000 };
const events = skillService.getAll().flatMap((skill) => skill.skillHitEvents);
if (events.length === 0) throw new Error("no skill hit events cached");

const run = (driver: ICalcDriver, iterations: number) => {
    calcService.use(driver);
    const started = performance.now();
    let damage = 0;
    for (let index = 0; index < iterations; index++) {
        const event = events[index % events.length];
        damage += calculateDamage({ attacker, defender, event, seed: `bench:${index}` }).damage;
    }
    const seconds = (performance.now() - started) / 1000;
    console.info(
        `${driver.name.padEnd(7)} ${Math.round(iterations / seconds).toLocaleString("en-US")} hit/s  (${(
            (seconds / iterations) *
            1e6
        ).toFixed(2)} µs/hit, checksum ${damage})`
    );
};

for (const driver of [new CalcService("native"), new CalcService("big")]) run(driver, 2_000); // khởi động JIT
for (const driver of [new CalcService("native"), new CalcService("big")]) run(driver, 100_000);
process.exit(0);
