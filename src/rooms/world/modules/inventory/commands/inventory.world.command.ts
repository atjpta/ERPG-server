import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { inventoryWorldService } from "@/rooms/world/modules/inventory/services/inventory.world.service.js";
import type { InventoryResult } from "@/rooms/world/modules/inventory/types/inventory.world.type.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { attributeWorldService } from "@/rooms/world/modules/players/services/attribute.world.service.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";
import type { z } from "zod";

interface InventoryCommandPayload {
    client: PlayerClient;
    payload: unknown;
}

/**
 * Khung chung cho thao tác túi đồ: validate payload, chặn khi đã chết, chạy thao tác rồi gửi lại
 * `inventory` (kể cả khi lỗi). Đổi đồ đang mặc thì gửi thêm `attributes` (stat mới).
 */
export abstract class InventoryWorldCommand<TSchema extends z.ZodType, TValue> extends Command<
    WorldRoom,
    InventoryCommandPayload
> {
    protected abstract readonly schema: TSchema;
    /** Thao tác có random kết quả → lưu DB ngay sau khi thành công. */
    protected readonly saveImmediately: boolean = false;
    /** Có thể đổi stat (đồ đang mặc) → gửi thêm `attributes`. */
    protected readonly changesStats: boolean = false;

    protected abstract run(
        player: PlayerWorldState,
        payload: z.infer<TSchema>
    ): InventoryResult<TValue>;

    /** Gửi thêm message riêng khi thành công (vd kết quả cường hoá). */
    protected onSuccess(_client: PlayerClient, _value: TValue): void {}

    async execute({ client, payload }: InventoryCommandPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player) return;

        const parsed = this.schema.safeParse(payload);
        const result: InventoryResult<TValue> = !parsed.success
            ? { ok: false, error: "Invalid payload" }
            : player.hp <= 0
              ? { ok: false, error: "Player is dead" }
              : this.run(player, parsed.data);

        if ("error" in result) {
            inventoryWorldService.send(client, player, result.error);
            return;
        }
        this.onSuccess(client, result.value);
        inventoryWorldService.send(client, player);
        if (this.changesStats) attributeWorldService.send(client, player);
        if (this.saveImmediately) await worldService.savePlayer(this.room, client.sessionId);
    }
}
