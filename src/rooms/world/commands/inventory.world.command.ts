import { Command } from "@colyseus/command";
import type { z } from "zod";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { attributeWorldService } from "@/rooms/world/services/attribute.world.service.js";
import {
    inventoryWorldService,
    type InventoryResult,
} from "@/rooms/world/services/inventory.world.service.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import {
    DisassembleItemsSchema,
    EquipItemSchema,
    LockItemSchema,
    MoveItemSchema,
    UnequipItemSchema,
    UpgradeEquipmentSchema,
} from "@/rooms/world/validators/inventory.world.validator.js";
import { WorldMessage, type EquipmentUpgradeMessage } from "@/rooms/world/world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

interface InventoryCommandPayload {
    client: PlayerClient;
    payload: unknown;
}

/**
 * Khung chung cho thao tác túi đồ: validate payload, chặn khi đã chết, chạy thao tác rồi gửi lại
 * `inventory` (kể cả khi lỗi). Đổi đồ đang mặc thì gửi thêm `attributes` (stat mới).
 */
abstract class InventoryWorldCommand<TSchema extends z.ZodType, TValue> extends Command<
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

export class EquipItemWorldCommand extends InventoryWorldCommand<
    typeof EquipItemSchema,
    undefined
> {
    protected readonly schema = EquipItemSchema;
    protected override readonly changesStats = true;
    protected run(player: PlayerWorldState, { instanceId, slot }: z.infer<typeof EquipItemSchema>) {
        return inventoryWorldService.equip(player, instanceId, slot);
    }
}

export class UnequipItemWorldCommand extends InventoryWorldCommand<
    typeof UnequipItemSchema,
    undefined
> {
    protected readonly schema = UnequipItemSchema;
    protected override readonly changesStats = true;
    protected run(player: PlayerWorldState, { slot }: z.infer<typeof UnequipItemSchema>) {
        return inventoryWorldService.unequip(player, slot);
    }
}

export class MoveItemWorldCommand extends InventoryWorldCommand<typeof MoveItemSchema, undefined> {
    protected readonly schema = MoveItemSchema;
    protected run(
        player: PlayerWorldState,
        { type, fromSlot, toSlot }: z.infer<typeof MoveItemSchema>
    ) {
        return inventoryWorldService.move(player, type, fromSlot, toSlot);
    }
}

export class LockItemWorldCommand extends InventoryWorldCommand<typeof LockItemSchema, undefined> {
    protected readonly schema = LockItemSchema;
    protected run(
        player: PlayerWorldState,
        { instanceId, locked }: z.infer<typeof LockItemSchema>
    ) {
        return inventoryWorldService.lock(player, instanceId, locked);
    }
}

abstract class UpgradeWorldCommand<TSchema extends z.ZodType> extends InventoryWorldCommand<
    TSchema,
    EquipmentUpgradeMessage
> {
    protected override readonly saveImmediately = true;

    protected override onSuccess(client: PlayerClient, value: EquipmentUpgradeMessage) {
        client.send(WorldMessage.EQUIPMENT_UPGRADE, value);
    }
}

export class EnhanceEquipmentWorldCommand extends UpgradeWorldCommand<
    typeof UpgradeEquipmentSchema
> {
    protected readonly schema = UpgradeEquipmentSchema;
    protected override readonly changesStats = true;
    protected run(
        player: PlayerWorldState,
        { instanceId }: z.infer<typeof UpgradeEquipmentSchema>
    ) {
        return inventoryWorldService.enhance(player, instanceId);
    }
}

export class RefineEquipmentWorldCommand extends UpgradeWorldCommand<
    typeof UpgradeEquipmentSchema
> {
    protected readonly schema = UpgradeEquipmentSchema;
    protected override readonly changesStats = true;
    protected run(
        player: PlayerWorldState,
        { instanceId }: z.infer<typeof UpgradeEquipmentSchema>
    ) {
        return inventoryWorldService.refine(player, instanceId);
    }
}

/** Tính thử phân rã (cho client hiện bảng xác nhận nguyên liệu nhận được) — không đổi state. */
export class PreviewDisassembleWorldCommand extends Command<WorldRoom, InventoryCommandPayload> {
    execute({ client, payload }: InventoryCommandPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player) return;

        const parsed = DisassembleItemsSchema.safeParse(payload);
        if (!parsed.success) {
            inventoryWorldService.sendDisassemblePreview(client, player, [], "Invalid payload");
            return;
        }
        inventoryWorldService.sendDisassemblePreview(client, player, parsed.data.instanceIds);
    }
}

export class DisassembleItemsWorldCommand extends UpgradeWorldCommand<
    typeof DisassembleItemsSchema
> {
    protected readonly schema = DisassembleItemsSchema;
    protected run(
        player: PlayerWorldState,
        { instanceIds }: z.infer<typeof DisassembleItemsSchema>
    ) {
        return inventoryWorldService.disassemble(player, instanceIds);
    }
}
