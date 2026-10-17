/** Shared presence topic used by publishers and subscribed rooms across processes. */
export const userKickTopic = (userId: string) => `auth:kick:user:${userId}`;
