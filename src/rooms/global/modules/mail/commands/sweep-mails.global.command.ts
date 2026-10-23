import { mailService } from "@/modules/mails/services/mail.service.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import { mailGlobalService } from "@/rooms/global/modules/mail/services/mail.global.service.js";
import { Command } from "@colyseus/command";

/**
 * Timer ~1 giờ: xoá thư hết hạn của server (thư người chơi còn đính kèm chưa nhận được trả về người gửi); thư "trả lại" mới
 * sinh được báo cho người gửi đang online.
 */
export class SweepMailsGlobalCommand extends Command<GlobalRoom> {
    async execute() {
        try {
            const returned = await mailService.sweepExpired({ serverId: this.room.serverId });
            for (const row of returned) await mailGlobalService.notifyReceived(this.room, row);
        } catch (error) {
            console.error("[Mail] Sweep expired mails failed:", error);
        }
    }
}
