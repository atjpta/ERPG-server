import { z } from "zod";
import { PlayerStatus } from "@/modules/auth/enums/player-status.enum.js";
import { Direction } from "@/modules/player/enums/player.enum.js";
import { AttributesSchema, StatsSchema } from "@/modules/player/schemas/stat.schema.js";
import { OwnedSkillSchema } from "@/modules/skills/schemas/skill-config.schema.js";

/*
 * Schema `data` của endpoint `/user/players*` và `/user/classes*` — nguồn để `yarn unity:network` sinh class C#.
 * Chỉ khai báo field client dùng; server có thể trả thêm field khác, client bỏ qua.
 */

/** Nhân vật tối thiểu (id) client cần để chọn / vào game. */
export const UserPlayerRefResponse = z.object({ id: z.string() });

/** Một ô nhân vật ở màn chọn nhân vật. */
export const UserCharacterSummaryResponse = z.object({
    id: z.string(),
    name: z.string(),
    classCode: z.string(),
    /** Class tier 1 gốc của `classCode` (hình dùng khi class sau chưa có hình). */
    baseClassCode: z.string(),
    level: z.number().int(),
    status: z.enum(PlayerStatus),
    lastPlayedAt: z.string().nullable(),
});

/** `GET /user/players`: nhân vật của tài khoản + giới hạn tạo nhân vật (master data `player_config`). */
export const UserCharacterListResponse = z.object({
    players: z.array(UserCharacterSummaryResponse),
    maxCharacters: z.number().int(),
    nameMinLength: z.number().int(),
    nameMaxLength: z.number().int(),
});

/** `POST /user/players` và `POST /user/players/:id/select`: nhân vật + token để vào room. */
export const UserPlayerTokenResponse = z.object({
    player: UserPlayerRefResponse,
    playerToken: z.string(),
});

export const UserRandomNameResponse = z.object({ name: z.string() });

/** `GET /user/players/me` và `PUT /user/players/me/name`. */
export const UserPlayerMeResponse = z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(PlayerStatus),
    level: z.number().int(),
    exp: z.number(),
    mapCode: z.string(),
    x: z.number(),
    y: z.number(),
    direction: z.enum(Direction),
    hp: z.number().int(),
    mp: z.number().int(),
    attributePoints: z.number().int(),
    skillPoints: z.number().int(),
});

/** Class nhân vật (`GET /user/classes`, `GET /user/classes/starter`). */
export const UserClassResponse = z.object({
    code: z.string(),
    tier: z.number().int(),
    baseAttributes: AttributesSchema,
    baseStats: StatsSchema,
    skills: z.array(OwnedSkillSchema),
    /** Các hướng chuyển cấp (class con trực thuộc). */
    nextClassCodes: z.array(z.string()),
    nextClassRequiredLevel: z.number().int().nullable(),
    /** Đồ gắn các class này thì mặc được (client làm mờ đồ không mặc được). */
    usableItemClassCodes: z.array(z.string()),
});
