import { and, eq, gt } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { MailBroadcasts } from "@/modules/mails/entities/mail-broadcast.entity.js";

export class MailBroadcastRepository extends BaseRepository<typeof MailBroadcasts> {
    constructor() {
        super(MailBroadcasts);
    }

    /** Broadcast của server còn hạn. */
    async findActive(params: { serverId: string; now: Date; dbOrTx?: Queryable }) {
        const { serverId, now, dbOrTx = db } = params;
        return dbOrTx
            .select()
            .from(MailBroadcasts)
            .where(and(eq(MailBroadcasts.serverId, serverId), gt(MailBroadcasts.expiresAt, now)));
    }
}

export const MailBroadcastRepo = new MailBroadcastRepository();
