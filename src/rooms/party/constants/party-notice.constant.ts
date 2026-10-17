import { PartyError } from "@/rooms/party/schemas/party.state.js";
import { PartyNoticeCode } from "@/rooms/party/types/party-message.type.js";

export const PARTY_NOTICE_BY_ERROR: Record<PartyError, PartyNoticeCode> = {
    [PartyError.NOT_LEADER]: PartyNoticeCode.NOT_LEADER,
    [PartyError.PARTY_FULL]: PartyNoticeCode.PARTY_FULL,
    [PartyError.SELF_TARGET]: PartyNoticeCode.SELF_TARGET,
    [PartyError.ALREADY_MEMBER]: PartyNoticeCode.ALREADY_MEMBER,
    [PartyError.NOT_MEMBER]: PartyNoticeCode.NOT_MEMBER,
};
