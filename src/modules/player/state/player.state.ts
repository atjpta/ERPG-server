import type { PlayerStateOwner } from "@/modules/player/types/player-state-owner.type.js";
import { Response } from "@/core/response/response.js";
import type { PlayerQuestEntry } from "@/modules/quests/schemas/quest.schema.js";
import type { FlagValue } from "@/modules/dialogues/schemas/condition.schema.js";
import type { CurrencyReward, ItemReward } from "@/modules/rewards/types/reward.type.js";
import type { DateTime } from "luxon";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { PLAYER_GROUP_COLUMNS } from "@/modules/player/constants/player-state.constant.js";
import { InventoryState } from "@/modules/player/state/inventory.state.js";
import type { GrantOutcome } from "@/modules/player/types/inventory.type.js";
import type { PlayerChangeOp } from "@/modules/player/types/player-change.type.js";
import { EquipmentInstanceState } from "@/modules/equipment/state/equipment-instance.state.js";
import { PlayerDataGroup } from "@/modules/player/enums/player-state.enum.js";
import { toInventories, type Inventories } from "@/modules/player/schemas/inventory.schema.js";
import type { AttributeKey, Attributes, Stats } from "@/modules/player/schemas/stat.schema.js";
import { playerStatService } from "@/modules/player/services/player-stat.service.js";
import { playerService } from "@/modules/player/services/player.service.js";
import { QuestLogState } from "@/modules/quests/state/quest-log.state.js";
import { WalletState } from "@/modules/player/state/wallet.state.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";
import type {
    AttributeSummary,
    PlaceCapture,
    PlayerExtras,
    PlayerPartyState,
    PlayerPresence,
} from "@/modules/player/types/player-state.type.js";

export class PlayerState {
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
        readonly owner: PlayerStateOwner,
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
    fork(data: PlayerSavedState): PlayerState {
        return new PlayerState(
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

    /** Ba túi theo loại item — view trên `data`. */
    get inventories(): Inventories {
        return toInventories(this.data);
    }

    /** Ba túi dưới dạng state (đếm / thêm / bớt / đổi ô), sửa thẳng vào `data`. */
    get bag(): InventoryState {
        return new InventoryState(this.inventories);
    }

    /** Tìm trang bị theo `instanceId` trong túi hoặc đồ đang mặc. */
    findOwned(instanceId: string): EquipmentInstanceState | undefined {
        return EquipmentInstanceState.find(this.inventories, this.data.equipments, instanceId);
    }

    /** Cộng điểm tiềm năng; thất bại (không đổi gì) nếu `request` không hợp lệ. */
    updateAttributes(request: Partial<Record<AttributeKey, number>>): Response {
        const result = playerService.updateAttributePoints(
            this.data.allocatedAttributes,
            this.data.attributePoints,
            request
        );
        if (Response.isError(result)) return result;
        this.data.allocatedAttributes = result.data.allocatedAttributes;
        this.data.attributePoints = result.data.attributePoints;
        this.refreshStats();
        return Response.success();
    }

    /** Kết quả nếu cộng điểm như `request` — không đổi dữ liệu; thất bại nếu không hợp lệ. */
    previewAttributes(request: Partial<Record<AttributeKey, number>>): Response<AttributeSummary> {
        const result = playerService.updateAttributePoints(
            this.data.allocatedAttributes,
            this.data.attributePoints,
            request
        );
        if (Response.isError(result)) return result;
        const { allocatedAttributes, attributePoints } = result.data;
        const { attributes, stats } = playerStatService.compute({
            classId: this.classId,
            allocatedAttributes,
            equipments: this.data.equipments,
        });
        return Response.success({
            attributePoints,
            allocatedAttributes: { ...allocatedAttributes },
            attributes: { ...attributes },
            stats: { ...stats },
        });
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

    /** Chạy lô thao tác túi / điểm trên state này; lỗi nghiệp vụ trả `Response` thất bại (state có thể đã đổi một phần — kiểm trước bằng `checkOps`). */
    runOps(ops: readonly PlayerChangeOp[], grants: GrantOutcome[] = []): Response {
        for (const op of ops) {
            if (op.type === "takeItem") {
                if (!this.bag.takeByCode(op.itemCode, op.quantity)) {
                    return Response.error(ItemErrorCode.ITEM_NOT_ENOUGH);
                }
            } else if (op.type === "giveItem") {
                if (op.requireFit && !this.bag.canFit(op.items)) {
                    return Response.error(ItemErrorCode.INVENTORY_FULL);
                }
                grants.push(this.bag.grant(op.items, op.source));
            } else {
                this.addPoints(op.attributePoints, op.skillPoints);
            }
        }
        return Response.success();
    }

    /** Cả lô có áp dụng được không — thử trên bản sao của túi, không đổi state này. */
    checkOps(ops: readonly PlayerChangeOp[]): Response {
        const mayFail = ops.some(
            (op) => op.type === "takeItem" || (op.type === "giveItem" && op.requireFit)
        );
        if (!mayFail) return Response.success();
        const trial = {} as Record<string, unknown>;
        for (const column of PLAYER_GROUP_COLUMNS[PlayerDataGroup.BAG]) {
            trial[column] = structuredClone(this.data[column]);
        }
        return this.fork(trial as PlayerSavedState).runOps(ops);
    }

    /** World room (ở process nào) đang giữ player; `undefined` khi chưa vào world. */
    get worldRoomId(): string | undefined {
        return this.presence?.worldRoomId;
    }

    get isInWorld(): boolean {
        return this.presence !== undefined;
    }

    // ---- ví ---------------------------------------------------------------------------------------------------------------------

    /** Ví của player (view trên `data.wallet`, sửa thẳng vào đó). */
    get wallet(): WalletState {
        return new WalletState(this.data.wallet);
    }

    /** Đủ tiền trả `costs` không (không đổi ví). */
    canAfford(costs: readonly CurrencyReward[]): boolean {
        return this.wallet.canAfford(costs);
    }

    /** Cộng tiền thưởng vào ví (chỉ đổi dữ liệu trong state này; lưu / báo client là việc của owner). */
    creditWallet(rewards: readonly CurrencyReward[]): void {
        this.wallet.credit(rewards);
    }

    /** Trừ tiền; `false` (không đổi gì) nếu không đủ. */
    debitWallet(costs: readonly CurrencyReward[]): boolean {
        return this.wallet.debit(costs);
    }

    // ---- túi ---------------------------------------------------------------------------------------------------------------------

    /** Số item (theo code) đang có. */
    countItem(itemCode: string): number {
        return this.bag.countByCode(itemCode);
    }

    /** Túi có đủ chỗ nhận hết `items` không (không đổi túi). */
    canFit(items: readonly ItemReward[]): boolean {
        return this.bag.canFit(items);
    }

    // ---- cờ cốt truyện / quest -----------------------------------------------------------------------------------------------------

    /** Nhật ký quest / cờ cốt truyện / quest hằng ngày — view trên `data`, sửa thẳng vào đó. */
    get questLog(): QuestLogState {
        return new QuestLogState(this.data);
    }

    hasFlag(key: string): boolean {
        return this.questLog.hasFlag(key);
    }

    setFlag(key: string, value: FlagValue = true) {
        this.questLog.setFlag(key, value);
    }

    /** Chức năng đã mở khoá (quest mở khoá ghi cờ `unlock.<feature>`). */
    isUnlocked(feature: string): boolean {
        return this.questLog.isUnlocked(feature);
    }

    unlockFeature(feature: string) {
        this.questLog.unlockFeature(feature);
    }

    unlockedFeatures(): string[] {
        return this.questLog.unlockedFeatures();
    }

    /** Đã đến map này chưa (điều kiện để teleport tới). */
    hasVisitedMap(mapCode: string): boolean {
        return this.questLog.hasVisitedMap(mapCode);
    }

    visitMap(mapCode: string) {
        this.questLog.visitMap(mapCode);
    }

    /** Bắt đầu (hoặc làm lại) quest `questCode` từ `now`. */
    startQuest(questCode: string, now: DateTime): PlayerQuestEntry {
        return this.questLog.start(questCode, now);
    }
}
