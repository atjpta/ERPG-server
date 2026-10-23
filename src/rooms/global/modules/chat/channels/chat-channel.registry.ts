import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import type { ChatChannel } from "@/rooms/global/modules/chat/channels/chat-channel.type.js";
import { generalChatChannel } from "@/rooms/global/modules/chat/channels/general.chat.channel.js";
import { partyChatChannel } from "@/rooms/global/modules/chat/channels/party.chat.channel.js";
import { whisperChatChannel } from "@/rooms/global/modules/chat/channels/whisper.chat.channel.js";
import { worldChatChannel } from "@/rooms/global/modules/chat/channels/world.chat.channel.js";

/** Mọi kênh chat của global room. Thêm kênh mới = viết `<key>.chat.channel.ts` rồi thêm vào danh sách này. */
const CHANNELS: readonly ChatChannel[] = [
    worldChatChannel,
    generalChatChannel,
    partyChatChannel,
    whisperChatChannel,
];

const byKey = new Map(CHANNELS.map((channel) => [channel.key, channel]));
if (byKey.size !== CHANNELS.length) throw new Error("Duplicate chat channel key");

export const chatChannelRegistry = {
    get: (key: ChatChannelKey): ChatChannel | undefined => byKey.get(key),
};
