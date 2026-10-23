import { mailTransferService } from "@/modules/mails/services/mail-transfer.service.js";
import { friendshipService } from "@/modules/friends/services/friendship.service.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import { mailGlobalService } from "@/rooms/global/modules/mail/services/mail.global.service.js";
import { Command } from "@colyseus/command";

/**
 * Timer ~1 giờ và một lần sau khi room khởi tạo (làm bù phần tồn đọng trong lúc server tắt): dọn thư hết hạn theo lô tới khi hết (thư
 * người chơi còn đính kèm chưa nhận được trả về người gửi; giá COD đã trả được hoàn) và dọn lời mời kết bạn hết hạn. Thư "trả lại" mới
 * sinh được báo cho người gửi đang online.
 */
export class SweepMailsGlobalCommand extends Command<GlobalRoom> {
    async execute() {
        const { room } = this;
        try {
            const { returned, swept } = await mailTransferService.sweepExpired({
                serverId: room.serverId,
            });
            for (const row of returned) await mailGlobalService.notifyReceived(room, row);
            if (swept > 0) console.info(`[Mail] Swept ${swept} expired mails`);
        } catch (error) {
            console.error("[Mail] Sweep expired mails failed:", error);
        }
        try {
            let purged = 0;
            for (let batch = 0; batch < 50; batch++) {
                const deleted = await friendshipService.purgeExpiredRequests(500);
                purged += deleted;
                if (deleted < 500) break;
            }
            if (purged > 0) console.info(`[Friend] Purged ${purged} expired friend requests`);
        } catch (error) {
            console.error("[Friend] Purge expired friend requests failed:", error);
        }
    }
}
