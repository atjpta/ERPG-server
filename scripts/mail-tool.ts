/**
 * Công cụ dev gửi mail hệ thống (chưa có API admin): `yarn mail:tool <lệnh> ...`. Cần DB đã migrate + seed; server có thể đang chạy
 * (người nhận online sẽ thấy thư khi mở hộp thư — push realtime chỉ có khi thư sinh ra bên trong server).
 *
 *   yarn mail:tool gift <tênNgườiChơi> [--gold N] [--gem N] [--item <codeItem>] [--qty N]   thư thưởng (mẫu gift_code)
 *   yarn mail:tool notice <tênNgườiChơi> <nội dung...>                            thư thông báo (mẫu system_notice)
 *   yarn mail:tool broadcast [--gold N] [--gem N] [--item <codeItem>] [--qty N] [--skip-new] [--days N]  broadcast mọi game server
 *   yarn mail:tool expire <tênNgườiChơi>                                          cho mọi thư của người đó hết hạn + chạy dọn
 *   yarn mail:tool giftcode create <MÃ> [--gold N] [--gem N] [--item <codeItem>] [--qty N] [--max N]
 *                                       [--starts <ISO>] [--expires <ISO>] [--server <codeGameServer>] [--note ...]   tạo gift code
 *   yarn mail:tool giftcode list                                                   liệt kê gift code + số lượt đã dùng
 *   yarn mail:tool giftcode disable|enable <MÃ>                                    tắt / bật gift code
 */
import { eq, sql } from "drizzle-orm";
import { setCacheDataApp } from "@/cache-data/index.js";
import { connectPostgres, db } from "@/configs/postgres.config.js";
import { GameServers } from "@/modules/auth/entities/game-server.entity.js";
import { Players } from "@/modules/auth/entities/player.entity.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { GiftCodes } from "@/modules/gift-codes/entities/gift-code.entity.js";
import { GiftCodeRepo } from "@/modules/gift-codes/repositories/gift-code.repository.js";
import { giftCodeService } from "@/modules/gift-codes/services/gift-code.service.js";
import { Mails } from "@/modules/mails/entities/mail.entity.js";
import { mailTransferService } from "@/modules/mails/services/mail-transfer.service.js";
import { mailService } from "@/modules/mails/services/mail.service.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type { MailReward } from "@/modules/rewards/schemas/mail-reward.schema.js";
import type { RewardSpec } from "@/modules/rewards/schemas/reward-spec.schema.js";

const [command, ...rest] = process.argv.slice(2);
const flags = new Map<string, string>();
const positional: string[] = [];
for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) {
        const next = rest[i + 1];
        const hasValue = next !== undefined && !next.startsWith("--");
        flags.set(rest[i].slice(2), hasValue ? next : "true");
        if (hasValue) i++;
    } else positional.push(rest[i]);
}

function die(message: string): never {
    console.error(`✗ ${message}`);
    process.exit(1);
}

function buildReward(): MailReward {
    const reward: MailReward = { currency: [], items: [], source: ItemSource.MAIL, exp: 0 };
    const gold = Number(flags.get("gold") ?? 0);
    if (gold > 0) reward.currency.push({ code: CurrencyCode.GOLD, amount: gold });
    const gem = Number(flags.get("gem") ?? 0);
    if (gem > 0) reward.currency.push({ code: CurrencyCode.GEM, amount: gem });
    const itemCode = flags.get("item");
    if (itemCode) {
        const item = itemService.getByCode(itemCode);
        if (!item) die(`Không có item "${itemCode}"`);
        reward.items.push({ itemId: item.id, quantity: Number(flags.get("qty") ?? 1) });
    }
    return reward;
}

function buildRewardSpec(): RewardSpec {
    const spec: RewardSpec = { exp: 0, currency: [], items: [] };
    const gold = Number(flags.get("gold") ?? 0);
    if (gold > 0) spec.currency.push({ code: CurrencyCode.GOLD, amount: gold });
    const gem = Number(flags.get("gem") ?? 0);
    if (gem > 0) spec.currency.push({ code: CurrencyCode.GEM, amount: gem });
    const itemCode = flags.get("item");
    if (itemCode) {
        if (!itemService.getByCode(itemCode)) die(`Không có item "${itemCode}"`);
        spec.items.push({ itemCode, quantity: Number(flags.get("qty") ?? 1) });
    }
    return spec;
}

function optionalDate(flag: string): Date | null {
    const raw = flags.get(flag);
    if (!raw) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) die(`--${flag} không phải ngày hợp lệ (ISO): "${raw}"`);
    return date;
}

async function findPlayer(name: string | undefined) {
    if (!name) die("Thiếu tên người chơi");
    const [player] = await db
        .select()
        .from(Players)
        .where(sql`lower(${Players.name}) = ${name.toLowerCase()}`)
        .limit(1);
    if (!player) die(`Không có người chơi "${name}"`);
    return player;
}

await connectPostgres();
await setCacheDataApp();

switch (command) {
    case "gift": {
        const player = await findPlayer(positional[0]);
        const reward = buildReward();
        if (reward.currency.length === 0 && reward.items.length === 0)
            die("Cần --gold, --gem hoặc --item");
        const mail = await mailService.sendReward({
            serverId: player.serverId,
            recipientPlayerId: player.id,
            templateCode: "gift_code",
            reward,
        });
        console.info(`✓ Đã gửi thư thưởng ${mail.id} cho ${player.name}`);
        break;
    }
    case "notice": {
        const player = await findPlayer(positional[0]);
        const message = positional.slice(1).join(" ");
        if (!message) die("Thiếu nội dung");
        const mail = await mailService.sendSystem({
            serverId: player.serverId,
            recipientPlayerId: player.id,
            templateCode: "system_notice",
            params: { message },
        });
        console.info(`✓ Đã gửi thông báo ${mail.id} cho ${player.name}`);
        break;
    }
    case "broadcast": {
        const reward = buildReward();
        const hasReward = reward.currency.length > 0 || reward.items.length > 0;
        for (const server of await db.select().from(GameServers)) {
            const broadcast = await mailService.sendBroadcast({
                serverId: server.id,
                templateCode: "gift_code",
                reward: hasReward ? reward : null,
                skipNewPlayers: flags.has("skip-new"),
                ...(flags.has("days") ? { expiresInDays: Number(flags.get("days")) } : {}),
            });
            console.info(`✓ Broadcast ${broadcast.id} cho server ${server.code}`);
        }
        break;
    }
    case "expire": {
        const player = await findPlayer(positional[0]);
        await db
            .update(Mails)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(eq(Mails.recipientPlayerId, player.id));
        const { returned } = await mailTransferService.sweepExpired({ serverId: player.serverId });
        console.info(`✓ Đã dọn thư hết hạn; ${returned.length} thư trả đính kèm về người gửi`);
        break;
    }
    case "giftcode": {
        const [action, rawCode] = positional;
        if (action === "list") {
            const rows = await db.select().from(GiftCodes);
            for (const row of rows) {
                const uses = `${row.usedCount}/${row.maxUses ?? "∞"}`;
                console.info(
                    `${row.active ? "●" : "○"} ${row.code}  dùng ${uses}  hết hạn ${row.expiresAt?.toISOString() ?? "—"}  ${JSON.stringify(row.reward)}`
                );
            }
            if (rows.length === 0) console.info("(chưa có gift code)");
            break;
        }
        if (!rawCode) die("Thiếu mã");
        const code = giftCodeService.normalize(rawCode);
        if (action === "create") {
            if (!/^[A-Z0-9_-]{4,32}$/.test(code)) die("Mã gồm A-Z 0-9 _ -, dài 4–32 ký tự");
            const reward = buildRewardSpec();
            if (reward.currency.length === 0 && reward.items.length === 0)
                die("Cần --gold, --gem hoặc --item");
            let serverId: string | null = null;
            if (flags.has("server")) {
                const [server] = await db
                    .select()
                    .from(GameServers)
                    .where(eq(GameServers.code, flags.get("server")!))
                    .limit(1);
                if (!server) die(`Không có game server "${flags.get("server")}"`);
                serverId = server.id;
            }
            if (await GiftCodeRepo.findByCode({ code })) die(`Mã ${code} đã tồn tại`);
            const row = await GiftCodeRepo.create({
                data: {
                    code,
                    serverId,
                    startsAt: optionalDate("starts"),
                    expiresAt: optionalDate("expires"),
                    maxUses: flags.has("max") ? Number(flags.get("max")) : null,
                    reward,
                    note: flags.get("note") ?? null,
                },
            });
            console.info(`✓ Đã tạo gift code ${row.code} (${row.id})`);
        } else if (action === "disable" || action === "enable") {
            const row = await GiftCodeRepo.findByCode({ code });
            if (!row) die(`Không có mã ${code}`);
            await GiftCodeRepo.updateById({ id: row.id, data: { active: action === "enable" } });
            console.info(`✓ ${code}: ${action === "enable" ? "đã bật" : "đã tắt"}`);
        } else die("giftcode create | list | disable | enable");
        break;
    }
    default:
        die(
            "Lệnh: gift | notice | broadcast | expire | giftcode (xem đầu file scripts/mail-tool.ts)"
        );
}

process.exit(0);
