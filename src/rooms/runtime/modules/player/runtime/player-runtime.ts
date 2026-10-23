import type { PlayerRuntimeService } from "@/rooms/runtime/modules/player/services/player-runtime.service.js";
import type { ErrorCode } from "@/core/types/result.type.js";
import {
    equipmentInstanceService,
    type OwnedEquipment,
} from "@/modules/equipment/services/equipment-instance.service.js";
import { PlayerDataGroup } from "@/rooms/runtime/modules/player/enums/player-runtime.enum.js";
import { toInventories, type Inventories } from "@/modules/player/schemas/inventory.schema.js";
import type { AttributeKey, Attributes, Stats } from "@/modules/player/schemas/stat.schema.js";
import { playerStatService } from "@/modules/player/services/player-stat.service.js";
import { playerService } from "@/modules/player/services/player.service.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";
import type {
    AttributeSummary,
    PlaceCapture,
    PlayerExtras,
    PlayerPartyState,
    PlayerPresence,
} from "@/rooms/runtime/modules/player/types/player-runtime.type.js";

export class PlayerRuntime {
    /** Phiên bản dòng `player_states` đã biết (khoá lạc quan). */
    revision: number;
    /** Nhóm đã đổi nhưng chưa lưu. */
    readonly dirty = new Set<PlayerDataGroup>();
    /** Có thay đổi cần lưu sớm (không đợi autosave) chưa lưu. */
    critical = false;
    /** Các bên đang dùng (`global:<sessionId>`, `world:<roomId>`). */
    readonly users = new Set<string>();
    /** Bên đăng ký `capturePlace` (world room hiện tại); chỉ chính nó được gỡ. */
    captureOwner?: string;
    capturePlace?: () => PlaceCapture | undefined;
    /** Thay đổi đồng bộ (`mutate`) xảy ra trong lúc một `transact` đang chạy, phát lại sau khi transact xong. */
    replay?: { group: PlayerDataGroup; change: (data: PlayerSavedState) => unknown }[];
    /** Nhóm mà `transact` đang chạy sẽ ghi (để biết `mutate` nào cần phát lại). */
    transactGroups?: ReadonlySet<PlayerDataGroup>;
    /** Giá trị lần lưu / nạp cuối của nhóm sửa tại chỗ (progress) để biết nhóm có đổi không. */
    baseline = new Map<PlayerDataGroup, string>();
    /** Lúc (ms) tới lượt autosave kế tiếp; lệch nhau giữa các player để không dồn vào cùng một nhịp. */
    nextAutosaveAt = 0;
    presence?: PlayerPresence;
    party?: PlayerPartyState;
    attributes!: Attributes;
    stats!: Stats;
    readonly classCode: string;

    constructor(
        /** Service giữ runtime này (của game server nó thuộc về). */
        readonly owner: PlayerRuntimeService,
        readonly playerId: string,
        public name: string,
        readonly classId: string,
        classCode: string,
        public data: PlayerSavedState,
        readonly extras: PlayerExtras,
        revision: number
    ) {
        this.classCode = classCode;
        this.revision = revision;
        this.refreshStats();
    }

    markDirty(group: PlayerDataGroup, critical = false) {
        this.dirty.add(group);
        if (critical) this.critical = true;
    }

    /** Bản nháp độc lập (sao chép sâu) để sửa trong `transact`; chưa ảnh hưởng object thật. */
    draft(): PlayerSavedState {
        return structuredClone(this.data);
    }

    /**
     * Bản sao dùng `data` khác (thường là bản nháp của `transact`) để chạy các thao tác túi / trang bị / điểm trên đó mà không đụng
     * object thật. Chỉ dùng để đọc / sửa `data` và tính stats — không dùng như một player online (không có dirty, users...).
     */
    fork(data: PlayerSavedState): PlayerRuntime {
        return new PlayerRuntime(
            this.owner,
            this.playerId,
            this.name,
            this.classId,
            this.classCode,
            data,
            this.extras,
            this.revision
        );
    }

    /** Tính lại attribute / stats từ class + điểm đã cộng + trang bị (gọi khi nhóm `bag` đổi). */
    refreshStats() {
        const { attributes, stats } = playerStatService.compute({
            classId: this.classId,
            allocatedAttributes: this.data.allocatedAttributes,
            equipments: this.data.equipments,
        });
        this.attributes = attributes;
        this.stats = stats;
    }

    /** World room đăng ký lấy vị trí / HP mới nhất lúc lưu. */
    setCapture(owner: string, capture: () => PlaceCapture | undefined) {
        this.captureOwner = owner;
        this.capturePlace = capture;
    }

    clearCapture(owner: string) {
        if (this.captureOwner !== owner) return;
        this.captureOwner = undefined;
        this.capturePlace = undefined;
    }

    /** Ba túi theo loại item — view trên `data` (sửa túi qua `inventoryService`). */
    get inventories(): Inventories {
        return toInventories(this.data);
    }

    /** Tìm trang bị theo `instanceId` trong túi hoặc đồ đang mặc. */
    findOwned(instanceId: string): OwnedEquipment | undefined {
        return equipmentInstanceService.findOwned(
            this.inventories,
            this.data.equipments,
            instanceId
        );
    }

    /** Cộng điểm tiềm năng; trả `ErrorCode` lỗi nếu không hợp lệ, `undefined` khi thành công. */
    updateAttributes(request: Partial<Record<AttributeKey, number>>): ErrorCode | undefined {
        const result = playerService.updateAttributePoints(
            this.data.allocatedAttributes,
            this.data.attributePoints,
            request
        );
        if (typeof result === "string") return result;
        this.data.allocatedAttributes = result.allocatedAttributes;
        this.data.attributePoints = result.attributePoints;
        this.refreshStats();
        return undefined;
    }

    /** Kết quả nếu cộng điểm như `request` — không đổi dữ liệu; trả `ErrorCode` lỗi nếu không hợp lệ. */
    previewAttributes(
        request: Partial<Record<AttributeKey, number>>
    ): AttributeSummary | ErrorCode {
        const result = playerService.updateAttributePoints(
            this.data.allocatedAttributes,
            this.data.attributePoints,
            request
        );
        if (typeof result === "string") return result;
        const { attributes, stats } = playerStatService.compute({
            classId: this.classId,
            allocatedAttributes: result.allocatedAttributes,
            equipments: this.data.equipments,
        });
        return {
            attributePoints: result.attributePoints,
            allocatedAttributes: { ...result.allocatedAttributes },
            attributes: { ...attributes },
            stats: { ...stats },
        };
    }

    /** Điểm + thuộc tính + stats của player. */
    getAttributeSummary(): AttributeSummary {
        return {
            attributePoints: this.data.attributePoints,
            allocatedAttributes: { ...this.data.allocatedAttributes },
            attributes: { ...this.attributes },
            stats: { ...this.stats },
        };
    }

    /** Điểm tiềm năng / kỹ năng nhận thêm (lên level). */
    addPoints(attributePoints: number, skillPoints: number) {
        this.data.attributePoints += Math.max(0, attributePoints);
        this.data.skillPoints += Math.max(0, skillPoints);
    }
}
