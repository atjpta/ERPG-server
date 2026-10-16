export const BASE_SKILL_TICK_RATE = 20;
/** Nhịp mô phỏng của room world (Hz) — client predict cùng nhịp này (xem skills.json). */
export const WORLD_TICK_RATE = 40;

export const millisecondsToTicks = (milliseconds: number, tickRate: number) =>
    Math.max(1, Math.ceil((milliseconds * tickRate) / 1000));

/** Skill hit event ticks are authored against the original 20 Hz timeline. */
export const skillEventTicks = (authoredTicks: number, tickRate: number) =>
    millisecondsToTicks((authoredTicks * 1000) / BASE_SKILL_TICK_RATE, tickRate);
