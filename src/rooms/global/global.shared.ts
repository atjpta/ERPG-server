/**
 * Public entrypoint của global room cho room khác (world): DTO, enum, lời gọi RPC và dịch vụ không giữ state của
 * room. Không export `GlobalRoom` hay runtime sống của nó (registry party, presence...).
 */

export * from "@/rooms/global/types/global-message.type.js";
export * from "@/rooms/global/modules/chat/interfaces/chat.global.message.js";
export * from "@/rooms/global/modules/party/interfaces/party.global.message.js";
export * from "@/rooms/global/modules/dungeon-launch/interfaces/dungeon.global.message.js";
export * from "@/rooms/global/modules/player-data/interfaces/player-data.global.message.js";
export * from "@/rooms/global/modules/inventory/interfaces/inventory.global.message.js";
export * from "@/rooms/global/modules/equipment-upgrade/interfaces/equipment-upgrade.global.message.js";
export * from "@/rooms/global/modules/attributes/interfaces/attributes.global.message.js";
export type * from "@/rooms/global/modules/player-data/types/player-data.type.js";
export { EquipmentUpgradeAction } from "@/rooms/global/modules/equipment-upgrade/enums/equipment-upgrade-action.enum.js";
export { inventoryGlobalService } from "@/rooms/global/modules/inventory/services/inventory.global.service.js";
export { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";
export { PartyErrorCode } from "@/rooms/global/modules/party/enums/party-error-code.enum.js";
export { ChatErrorCode } from "@/rooms/global/modules/chat/enums/chat-error-code.enum.js";
export type { GlobalRoomOptions } from "@/rooms/global/types/global-room.type.js";
export { PartyLootMode } from "@/rooms/global/modules/party/types/party-member.type.js";
export type {
    PartyMembershipEvent,
    PartySnapshot,
} from "@/rooms/global/modules/party/types/party-rpc.type.js";
export type { DungeonLaunchRequest } from "@/rooms/global/modules/dungeon-launch/types/dungeon-launch.type.js";
export type { DungeonExpectation } from "@/rooms/global/modules/dungeon-launch/types/dungeon-expectation.type.js";
export { dungeonExpectationService } from "@/rooms/global/modules/dungeon-launch/services/dungeon-expectation.global.service.js";

// RPC world → global (command class để `callRoom` suy kiểu payload / kết quả).
export { AttachWorldGlobalCommand } from "@/rooms/global/modules/world-registry/commands/attach-world.global.command.js";
export { DetachWorldGlobalCommand } from "@/rooms/global/modules/world-registry/commands/detach-world.global.command.js";
export { HeartbeatWorldGlobalCommand } from "@/rooms/global/modules/world-registry/commands/heartbeat-world.global.command.js";
export { SyncPlayersGlobalCommand } from "@/rooms/global/modules/player-data/commands/sync-players.global.command.js";
export { ApplyPlayerChangesGlobalCommand } from "@/rooms/global/modules/player-data/commands/apply-player-changes.global.command.js";
export { LaunchDungeonGlobalCommand } from "@/rooms/global/modules/dungeon-launch/commands/launch-dungeon.global.command.js";

/** RPC mở dungeon gộp kiểm tra + vào của cả party trong một lần gọi nên cần timeout dài hơn mặc định 3s. */
export const DUNGEON_LAUNCH_TIMEOUT_MS = 10_000;
