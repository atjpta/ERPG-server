import type { ErrorCode } from "@/core/types/result.type.js";
import { Schema } from "@colyseus/schema";
import {
    equipmentInstanceService,
    type OwnedEquipment,
} from "@/modules/equipment/services/equipment-instance.service.js";
import type { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import {
    inventoryService,
    type GrantOutcome,
} from "@/modules/player/services/inventory.service.js";
import type { ItemReward } from "@/modules/rewards/types/reward.type.js";
import { classService } from "@/modules/classes/services/class.service.js";
import {
    fromInventories,
    toInventories,
    type Equipments,
    type Inventories,
} from "@/modules/player/schemas/inventory.schema.js";
import type { AttributeKey, Attributes, Stats } from "@/modules/player/schemas/stat.schema.js";
import { playerService } from "@/modules/player/services/player.service.js";
import { playerStatService } from "@/modules/player/services/player-stat.service.js";
import type { PlayerGlobalFields } from "@/modules/player/types/player-fields.type.js";
import type { PlayerSnapshot } from "@/modules/player/types/player.type.js";
import type { AttributesMessage } from "@/rooms/global/modules/attributes/interfaces/attributes.global.message.js";
import type {
    PlayerDataInit,
    PlayerDataSnapshot,
} from "@/rooms/global/modules/player-data/types/player-data.type.js";

/** Số eventId gần nhất nhớ để bỏ qua khi world gửi lại cùng một lô thay đổi. */
const MAX_PROCESSED_EVENTS = 256;

/**
 * PlayerData của một người chơi trong global room — state chỉ ở server (không `@type`, không sync cho client).
 * Global làm chủ: túi đồ, trang bị, điểm tiềm năng / kỹ năng và thuộc tính đã cộng (+ stats tính từ chúng).
 * `world` là bản gộp gần nhất của phần world làm chủ (level, ví, vị trí...) để lưu được cả hàng `player_states`;
 * muốn giá trị mới nhất thì kéo từ world trước (xem `PlayerDataService`). Chỉ đổi dữ liệu — gửi message / gọi
 * world là việc của service.
 */
export class PlayerDataState extends Schema {
    readonly playerId: string;
    name: string;
    readonly classId: string;
    readonly classCode: string;
    /** Revision của cả bản ghi `player_states` (khoá lạc quan khi lưu). */
    revision: number;

    attributePoints: number;
    skillPoints: number;
    allocatedAttributes: Attributes;
    equipments: Equipments;
    inventories: Inventories;
    attributes: Attributes;
    stats: Stats;

    worldRoomId?: string;
    mapCode?: string;
    instanceId?: string;
    seenAt = 0;

    /** eventId đã áp dụng — world gửi lại thì bỏ qua. */
    private readonly processedEvents: string[] = [];

    constructor(init: PlayerDataInit) {
        super();
        this.playerId = init.playerId;
        this.name = init.name;
        this.classId = init.classId;
        this.classCode = classService.getById(init.classId)?.code ?? "";
        this.revision = init.revision;
        this.attributePoints = init.global.attributePoints;
        this.skillPoints = init.global.skillPoints;
        this.allocatedAttributes = { ...init.global.allocatedAttributes };
        this.equipments = structuredClone(init.global.equipments);
        this.inventories = structuredClone(toInventories(init.global));
        this.refreshStats();
    }

    static fromSnapshot(snapshot: PlayerSnapshot): PlayerDataState {
        return new PlayerDataState({
            playerId: snapshot.id,
            name: snapshot.name,
            classId: snapshot.classId,
            revision: snapshot.stateRevision,
            global: snapshot,
        });
    }

    /** Đổi tên hiển thị trong phiên (sau khi tên mới đã ghi DB). */
    rename(name: string) {
        this.name = name;
    }

    get inWorld(): boolean {
        return this.worldRoomId !== undefined;
    }

    /** World room mới nhận người chơi (vào game / đổi map): ghi đè vị trí cũ. */
    enterWorld(
        worldRoomId: string,
        where: { mapCode: string; instanceId?: string },
        nowMs: number
    ) {
        this.worldRoomId = worldRoomId;
        this.mapCode = where.mapCode;
        this.instanceId = where.instanceId;
        this.seenAt = nowMs;
    }

    leaveWorld() {
        this.worldRoomId = undefined;
        this.mapCode = undefined;
        this.instanceId = undefined;
    }

    refreshStats() {
        const { attributes, stats } = playerStatService.compute(this);
        this.attributes = attributes;
        this.stats = stats;
    }

    /** Số item (theo code) đang có. */
    countByCode(itemCode: string): number {
        return inventoryService.countByCode(this.inventories, itemCode);
    }

    /** Trừ item theo code; `false` (không đổi gì) nếu không đủ. */
    takeByCode(itemCode: string, quantity: number): boolean {
        return inventoryService.takeByCode(this.inventories, itemCode, quantity);
    }

    /** Túi có đủ chỗ nhận hết `items` không (không đổi túi thật). */
    canFit(items: readonly ItemReward[]): boolean {
        return inventoryService.canFit(this.inventories, items);
    }

    /** Cộng item vào đúng túi; phần không còn chỗ nằm trong kết quả. */
    grantItems(items: readonly ItemReward[], source?: ItemSource): GrantOutcome {
        return inventoryService.grantItems(this.inventories, items, source);
    }

    /** Tìm trang bị theo `instanceId` trong túi hoặc đồ đang mặc. */
    findOwned(instanceId: string): OwnedEquipment | undefined {
        return equipmentInstanceService.findOwned(this.inventories, this.equipments, instanceId);
    }

    /** Đổi metadata (cường hoá / tinh hoá) của một trang bị; đang mặc thì tính lại stats. */
    updateEquipment(owned: OwnedEquipment, metadata: ItemEquipmentInstanceMetadata) {
        owned.entry.metadata = metadata;
        if (owned.equippedSlot) this.refreshStats();
    }

    /** Cộng điểm tiềm năng; trả `ErrorCode` lỗi nếu không hợp lệ, `undefined` khi thành công. */
    updateAttributes(request: Partial<Record<AttributeKey, number>>): ErrorCode | undefined {
        const result = playerService.updateAttributePoints(
            this.allocatedAttributes,
            this.attributePoints,
            request
        );
        if (typeof result === "string") return result;
        this.allocatedAttributes = result.allocatedAttributes;
        this.attributePoints = result.attributePoints;
        this.refreshStats();
        return undefined;
    }

    /** Kết quả nếu cộng điểm như `request` — không đổi state; trả `ErrorCode` lỗi nếu không hợp lệ. */
    previewAttributes(
        request: Partial<Record<AttributeKey, number>>
    ): AttributesMessage | ErrorCode {
        const result = playerService.updateAttributePoints(
            this.allocatedAttributes,
            this.attributePoints,
            request
        );
        if (typeof result === "string") return result;
        const { attributes, stats } = playerStatService.compute({
            classId: this.classId,
            allocatedAttributes: result.allocatedAttributes,
            equipments: this.equipments,
        });
        return {
            attributePoints: result.attributePoints,
            allocatedAttributes: { ...result.allocatedAttributes },
            attributes: { ...attributes },
            stats: { ...stats },
        };
    }

    /** Điểm + thuộc tính + stats của player. */
    getAttributeSummary(): AttributesMessage {
        return {
            attributePoints: this.attributePoints,
            allocatedAttributes: { ...this.allocatedAttributes },
            attributes: { ...this.attributes },
            stats: { ...this.stats },
        };
    }

    /** Điểm tiềm năng / kỹ năng nhận thêm (lên level ở world). */
    addPoints(attributePoints: number, skillPoints: number) {
        this.attributePoints += Math.max(0, attributePoints);
        this.skillPoints += Math.max(0, skillPoints);
    }

    /** Phần global làm chủ, dạng cột `player_states`. */
    toGlobalFields(): PlayerGlobalFields {
        return {
            attributePoints: this.attributePoints,
            skillPoints: this.skillPoints,
            allocatedAttributes: { ...this.allocatedAttributes },
            equipments: structuredClone(this.equipments),
            ...structuredClone(fromInventories(this.inventories)),
        };
    }

    /** Bản gửi world để làm replica. */
    toSnapshot(): PlayerDataSnapshot {
        return {
            revision: this.revision,
            attributePoints: this.attributePoints,
            skillPoints: this.skillPoints,
            allocatedAttributes: { ...this.allocatedAttributes },
            equipments: structuredClone(this.equipments),
            inventories: structuredClone(this.inventories),
        };
    }

    /** Bản làm việc để chạy một thao tác; hỏng thì bỏ, thành công thì `adopt` ngược lại. */
    workingCopy(): PlayerDataState {
        const copy = new PlayerDataState({
            playerId: this.playerId,
            name: this.name,
            classId: this.classId,
            revision: this.revision,
            global: this.toGlobalFields(),
        });
        return copy;
    }

    /** Nhận kết quả của bản làm việc (chỉ phần thao tác có thể đổi: phần global + ví). */
    adopt(work: PlayerDataState) {
        this.attributePoints = work.attributePoints;
        this.skillPoints = work.skillPoints;
        this.allocatedAttributes = work.allocatedAttributes;
        this.equipments = work.equipments;
        this.inventories = work.inventories;
        this.attributes = work.attributes;
        this.stats = work.stats;
    }

    /** Đã áp dụng `eventId` này chưa (world gửi lại cùng lô thì bỏ qua). */
    hasSeen(eventId: string): boolean {
        return this.processedEvents.includes(eventId);
    }

    /** Ghi nhớ `eventId` đã áp dụng thành công. */
    markSeen(eventId: string): void {
        this.processedEvents.push(eventId);
        if (this.processedEvents.length > MAX_PROCESSED_EVENTS) this.processedEvents.shift();
    }
}
