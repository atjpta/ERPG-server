import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import {
    equipmentUpgradeWorldService,
    fail,
} from "@/rooms/world/modules/inventory/services/equipment-upgrade.world.service.js";
import { DisassembleItemsSchema } from "@/rooms/world/modules/inventory/validators/inventory.world.validator.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import {
    WorldClientMessage,
    WorldMessage,
    type DisassemblePreviewMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface InventoryCommandPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Tính thử phân rã (cho client hiện bảng xác nhận nguyên liệu nhận được) — không đổi state. */
export class PreviewDisassembleWorldCommand extends Command<WorldRoom, InventoryCommandPayload> {
    static readonly message = WorldClientMessage.PREVIEW_DISASSEMBLE;

    execute({ client, payload }: InventoryCommandPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player) return;

        const parsed = DisassembleItemsSchema.safeParse(payload);
        if (!parsed.success) {
            this.sendDisassemblePreview(client, player, [], "Invalid payload");
            return;
        }
        this.sendDisassemblePreview(client, player, parsed.data.instanceIds);
    }

    /** Gửi `disassemblePreview`: nguyên liệu sẽ nhận nếu phân rã, không đổi gì trên player. */
    private sendDisassemblePreview(
        client: PlayerClient,
        player: PlayerWorldState,
        instanceIds: string[],
        error?: string
    ) {
        const result = error
            ? fail(error)
            : equipmentUpgradeWorldService.simulateDisassemble(player, instanceIds);
        const message: DisassemblePreviewMessage =
            "error" in result
                ? { ok: false, error: result.error, instanceIds, materials: [] }
                : { ok: true, instanceIds: result.value.ids, materials: result.value.received };
        client.send(WorldMessage.DISASSEMBLE_PREVIEW, message);
    }
}
