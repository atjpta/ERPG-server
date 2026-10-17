import type { PartyMemberInfo } from "@/rooms/party/schemas/party.schema.js";

export interface PartyInvite {
    fromName: string;
    /** Thông tin người được mời lúc gửi lời mời (world room trả về) — dùng tạo thành viên khi họ vào. */
    snapshot: PartyMemberInfo;
    expiresAt: number;
}
