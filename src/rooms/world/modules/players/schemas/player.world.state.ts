import { ArraySchema, Schema, type } from "@colyseus/schema";
import type { ErrorCode } from "@/core/types/result.type.js";
import type { ConditionContext } from "@/modules/dialogues/services/condition.service.js";
import { QuestState } from "@/modules/quests/enums/quest.enum.js";
import { questProgressService } from "@/modules/quests/services/quest-progress.service.js";
import { playerService } from "@/modules/player/services/player.service.js";
import type { CurrencyReward } from "@/modules/rewards/types/reward.type.js";
import { inventoryService } from "@/modules/player/services/inventory.service.js";
import { questOf } from "@/rooms/world/modules/content/utils/quest-resolve.world.util.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { ConsumableEffectType } from "@/modules/items/enums/item.enum.js";
import type { ConsumableEffect } from "@/modules/items/schemas/item-metadata.schema.js";
import type {
    PlayerPartyState,
    PlaceCapture,
} from "@/rooms/runtime/modules/player/types/player-runtime.type.js";
import type { PlayerRuntime } from "@/rooms/runtime/modules/player/runtime/player-runtime.js";
import type { ConsumableGain } from "@/rooms/world/modules/players/types/consumable.world.type.js";

import { big, floorBig, roundBig } from "@/core/utils/big-number.util.js";
import { entityBodyService } from "@/modules/bodies/services/entity-body.service.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { levelService } from "@/modules/levels/services/level.service.js";
import type { FlagValue } from "@/modules/dialogues/schemas/condition.schema.js";
import type { DungeonSession } from "@/modules/maps/entities/game-map.entity.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import {
    toInventories,
    type Equipments,
    type Inventories,
} from "@/modules/player/schemas/inventory.schema.js";
import type { Attributes, Stats } from "@/modules/player/schemas/stat.schema.js";
import type { Wallet } from "@/modules/player/schemas/wallet.schema.js";
import type { PlayerDailyQuests } from "@/modules/quests/schemas/daily-quest.schema.js";
import type { PlayerQuests } from "@/modules/quests/schemas/quest.schema.js";
import { DASH_SKILL_CODE, skillService } from "@/modules/skills/services/skill.service.js";
import { PartyLootMode } from "@/modules/master-data/enums/party-loot-mode.enum.js";
import { mapExtent } from "@/rooms/world/modules/players/simulation/movement.step.js";
import type { DamageCombatant } from "@/rooms/world/modules/combat/chains/damage.world.chain.js";
import { HitboxColliderState } from "@/rooms/world/modules/combat/schemas/hitbox-collider.world.state.js";
import {
    OwnedSkillState,
    toOwnedSkillStates,
} from "@/rooms/world/modules/players/schemas/owned-skill.world.state.js";
import { millisecondsToTicks } from "@/rooms/world/utils/tick.world.util.js";
import { PlayerStatService } from "@/modules/player/services/player-stat.service.js";

/** Hồi chiêu giữa hai lần dùng bình cùng loại (HP / MP). */
const POTION_COOLDOWN_MS = 10_000;

/** Trần của `dashTicks` / `dashCooldownTicks` (uint8). */
const MAX_DASH_TICKS = 0xff;

/** Trần của `skillCooldownTicks` (uint16). */
const MAX_SKILL_COOLDOWN_TICKS = 0xffff;

/** Player hiển thị trên map — chỉ chứa dữ liệu mọi người chơi khác cần thấy. */
export class PlayerWorldState extends Schema {
    @type("string") id: string;
    @type("string") name: string;
    @type("uint16") level: number;
    @type("float32") x: number;
    @type("float32") y: number;
    @type("string") direction: string;
    @type("boolean") moving: boolean = false;
    @type("uint32") hp: number;
    /** Từ stats của `PlayerRuntime` (`maxHp`, `maxMp`, `moveSpeed`) — chỉ ở server, không sync; client lấy từ push `attributes` của global. */
    maxHp: number;
    @type("uint32") mp: number;
    maxMp: number;
    moveSpeed: number;
    @type("uint8") attackCooldownTicks: number = 0;
    /**
     * Tick còn lại tới khi được bắt đầu đòn đánh thường kế tiếp: đếm từ lúc bắt đầu đòn, = max(thời lượng
     * đòn, `cooldownMs` của skill). Khác `attackCooldownTicks` (khoá di chuyển lúc vung), hết vung
     * vẫn đi lại được trong lúc chờ.
     */
    @type("uint16") skillCooldownTicks: number = 0;
    @type("boolean") dashing: boolean = false;
    @type("uint8") dashTicks: number = 0;
    @type("uint8") dashCooldownTicks: number = 0;
    /** Tick còn lại tới khi dùng lại được skill chủ động số 1 (đếm từ lúc bắt đầu skill; 0 = dùng được). */
    @type("uint16") skill1CooldownTicks: number = 0;
    /** Như `skill1CooldownTicks`, cho skill chủ động số 2. */
    @type("uint16") skill2CooldownTicks: number = 0;
    /** Như `skill1CooldownTicks`, cho skill chủ động số 3. */
    @type("uint16") skill3CooldownTicks: number = 0;
    /**
     * Đang lướt tới mục tiêu của skill lướt (charge, `castSlot` = skill đó): chưa ra đòn, `attackCooldownTicks` đếm lùi thời gian
     * lướt tối đa. Chạm collider mục tiêu thì thành đòn đánh bình thường (`attacking`, hit event tính từ lúc đó).
     */
    @type("boolean") charging: boolean = false;
    /** Mục tiêu đã chốt lúc bắt đầu lướt (không đổi khi người chơi đổi target giữa chừng). */
    @type("string") chargeTargetId: string = "";
    @type("boolean") attacking: boolean = false;
    @type("uint8") attackCombo: number = 0;
    /** Skill chủ động đang được dùng (số thứ tự từ 1); 0 = đòn đánh thường theo `attackCombo`. */
    @type("uint8") castSlot: number = 0;
    /**
     * Hướng ngắm của skill đang dùng (vector đơn vị, toạ độ server, y hướng lên): về phía target đang chọn nếu skill có hit
     * `aimed`, còn lại là hướng mặt (±1, 0). Chốt lúc bắt đầu skill; client xoay hiệu ứng / vùng đánh theo hướng này.
     */
    @type("float32") aimX: number = 1;
    @type("float32") aimY: number = 0;
    @type("boolean") hitInterrupted: boolean = false;
    @type(HitboxColliderState) hitbox: HitboxColliderState;
    @type(HitboxColliderState) collider: HitboxColliderState;
    @type("string") targetId = "";
    @type("boolean") targetLocked = false;
    @type([OwnedSkillState]) skills = new ArraySchema<OwnedSkillState>();
    @type("uint32") exp = 0;
    @type("uint32") expToNextLevel = 0;
    /** Code class hiện tại và class tier 1 gốc của nó (client chọn hình/animation theo class). */
    @type("string") classCode = "";
    @type("string") baseClassCode = "";

    /**
     * Dữ liệu lưu của player (ví, túi, trang bị, điểm, cờ, quest...) nằm trong `PlayerRuntime` dùng chung với global; các
     * getter dưới đây đọc thẳng từ đó (không giữ bản sao). Ví / túi chỉ đổi qua `PlayerRuntimeService`.
     */
    readonly runtime: PlayerRuntime;

    get wallet(): Wallet {
        return this.runtime.data.wallet;
    }

    /** Cờ cốt truyện và quest (server-only) — xem `player_states.flags/quests`; sửa tại chỗ, lưu theo autosave. */
    get flags(): Record<string, FlagValue> {
        return this.runtime.data.flags;
    }

    get quests(): PlayerQuests {
        return this.runtime.data.quests;
    }

    /** Quest hằng ngày đã sinh cho hôm nay (server-only). */
    get dailyQuests(): PlayerDailyQuests | null {
        return this.runtime.data.dailyQuests;
    }

    set dailyQuests(value: PlayerDailyQuests | null) {
        this.runtime.data.dailyQuests = value;
    }
    /** Map đích khi đã bước vào portal/teleport và đang đợi client vào room mới. */
    pendingMapCode?: string;
    /** Vị trí đích chốt lúc bắt đầu đổi map — room cũ còn simulate player tới khi client rời, không được để nó ghi đè vị trí lưu. */
    private pendingX = 0;
    private pendingY = 0;
    /** Cách chia item của party hiện tại (do chủ chọn; lấy từ `PlayerRuntime.party`). */
    partyLootMode: PartyLootMode = PartyLootMode.ROUND_ROBIN;
    /** Làng gần nhất đã đến (server-only) — chết trong dungeon thì hồi sinh ở đây. */
    get lastTownMapCode(): string | null {
        return this.runtime.data.lastTownMapCode;
    }

    set lastTownMapCode(value: string | null) {
        this.runtime.data.lastTownMapCode = value;
    }
    /** Lượt dungeon đang diễn ra (từ lúc bước vào portal dungeon tới khi thoát ra). */
    dungeonSession?: DungeonSession;

    get attributePoints(): number {
        return this.runtime.data.attributePoints;
    }

    get skillPoints(): number {
        return this.runtime.data.skillPoints;
    }
    /** `elapsedTime` (ms) của room tới lúc được dùng bình HP / MP tiếp theo (mỗi loại bình một hồi chiêu). */
    hpPotionReadyAt = 0;
    mpPotionReadyAt = 0;
    /** Giây còn lại của hồi chiêu bình HP / MP (0 = dùng được) — để client hiện đếm ngược. */
    @type("uint8") hpPotionCooldownSec = 0;
    @type("uint8") mpPotionCooldownSec = 0;
    /** Đang trong party hay không — client dùng để chọn "mời" hay "xin vào party" ở menu người chơi (id party vẫn server-only). */
    @type("boolean") inParty = false;
    /**
     * Party đang tham gia (id do global room cấp), đồng bộ cho mọi client trong room: client ghép với danh sách thành viên
     * của `partyState` để nhận ra đồng đội cùng map và đọc level / HP... của họ ngay từ state này. Đổi bằng `setParty`.
     * Khai báo sau cùng trong các field đồng bộ để không làm lệch chỉ số field cũ trong schema C#.
     */
    @type("string") partyId: string | null = null;

    classId: string;

    get allocatedAttributes(): Attributes {
        return this.runtime.data.allocatedAttributes;
    }

    get equipments(): Equipments {
        return this.runtime.data.equipments;
    }

    /** Túi theo loại item — view trên dữ liệu thật của runtime (đổi túi qua `PlayerRuntimeService`, không sửa ở đây). */
    get inventories(): Inventories {
        return toInventories(this.runtime.data);
    }

    get attributes(): Attributes {
        return this.runtime.attributes;
    }

    get stats(): Stats {
        return this.runtime.stats;
    }

    /** Tăng mỗi đòn đánh — một phần seed roll combat (`combatSeed`). */
    attackSerial = 0;
    /** Phần HP/MP hồi lẻ (< 1) cộng dồn giữa các tick. */
    private hpRegenCarry = big(0);
    private mpRegenCarry = big(0);

    constructor(props: { runtime: PlayerRuntime }) {
        const { runtime } = props;
        super();
        const { data, extras } = runtime;
        this.runtime = runtime;
        this.id = runtime.playerId;
        this.name = runtime.name;
        this.level = data.level;
        this.x = data.x;
        this.y = data.y;
        this.direction = data.direction === "left" ? "left" : "right";
        this.classId = runtime.classId;
        this.classCode = runtime.classCode;
        this.baseClassCode = this.classCode ? classService.getBaseClassCode(this.classCode) : "";
        this.syncStats();
        this.hp = this.maxHp;
        this.mp = data.mp;
        // The body follows the class prefab in Unity (not the row, which holds what it was when the character was made).
        const body = entityBodyService.classBody(this.classCode, this.baseClassCode);
        this.hitbox = new HitboxColliderState(body?.hitbox ?? extras.hitbox);
        this.collider = new HitboxColliderState(body?.collider ?? extras.collider);
        this.skills.push(...toOwnedSkillStates(extras.skills));
        this.setLevelProgress(data.level, data.exp);
        this.applyParty(runtime.party);
    }

    /** Đặt level / exp (Schema đồng bộ client + dữ liệu lưu của runtime, autosave ghi xuống DB). */
    setLevelProgress(level: number, exp: number) {
        this.level = level;
        this.exp = exp;
        this.runtime.data.level = level;
        this.runtime.data.exp = exp;
        this.expToNextLevel = levelService.getExpToNext(level) ?? 0;
    }

    /**
     * Lấy lại maxHp / maxMp / moveSpeed từ stats của runtime (gọi khi túi / trang bị / điểm đổi, từ world hay global) và kẹp
     * HP / MP theo mức tối đa mới.
     */
    syncStats() {
        const { stats } = this.runtime;
        const previousMaxHp = this.maxHp ?? 0;
        const previousMaxMp = this.maxMp ?? 0;
        this.maxHp = PlayerStatService.whole(stats, StatKey.MAX_HP);
        this.maxMp = PlayerStatService.whole(stats, StatKey.MAX_MP);
        this.moveSpeed = stats[StatKey.MOVE_SPEED] ?? 0;
        if (this.hp !== undefined && this.hp > 0) {
            this.hp = Math.min(this.maxHp, Math.max(1, this.hp + this.maxHp - previousMaxHp));
        }
        if (this.mp !== undefined) {
            this.mp = Math.min(this.maxMp, Math.max(0, this.mp + this.maxMp - previousMaxMp));
        }
    }

    /** Hồi HP/MP theo `hp_regen`/`mp_regen` (mỗi giây) sau `dt` giây; chết thì không hồi. */
    regenerate(dt: number) {
        if (this.hp <= 0) {
            this.hpRegenCarry = big(0);
            this.mpRegenCarry = big(0);
            return;
        }
        this.hpRegenCarry = roundBig(
            this.hpRegenCarry.plus(big(this.stats[StatKey.HP_REGEN] ?? 0).times(dt))
        );
        this.mpRegenCarry = roundBig(
            this.mpRegenCarry.plus(big(this.stats[StatKey.MP_REGEN] ?? 0).times(dt))
        );
        const hpGain = floorBig(this.hpRegenCarry);
        const mpGain = floorBig(this.mpRegenCarry);
        this.hpRegenCarry = this.hpRegenCarry.minus(hpGain);
        this.mpRegenCarry = this.mpRegenCarry.minus(mpGain);
        if (hpGain > 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + hpGain);
        if (mpGain > 0 && this.mp < this.maxMp) this.mp = Math.min(this.maxMp, this.mp + mpGain);
    }

    /** Cập nhật số giây còn lại của hồi chiêu bình (chỉ ghi khi đổi, để không đẩy state mỗi tick). */
    syncPotionCooldowns(now: number) {
        const hp = Math.min(255, Math.max(0, Math.ceil((this.hpPotionReadyAt - now) / 1000)));
        const mp = Math.min(255, Math.max(0, Math.ceil((this.mpPotionReadyAt - now) / 1000)));
        if (hp !== this.hpPotionCooldownSec) this.hpPotionCooldownSec = hp;
        if (mp !== this.mpPotionCooldownSec) this.mpPotionCooldownSec = mp;
    }

    /**
     * Cộng tiền và exp (thưởng): ví tăng ngay (lưu sớm ≤ 500 ms), lên level thì hồi đầy HP/MP và lưu sớm. Điểm tiềm năng khi
     * lên level là của nhóm túi nên người gọi cộng riêng (`PlayerDataWorldService.apply`).
     */
    gainCurrencyAndExp(
        currency: readonly CurrencyReward[],
        exp: number
    ): { level: number; levelsGained: number } {
        if (currency.some((entry) => entry.amount > 0)) {
            this.runtime.owner.credit(this.runtime, currency);
        }
        const progress = playerService.gainExp({ level: this.level, exp: this.exp }, exp, (level) =>
            levelService.getExpToNext(level)
        );
        this.setLevelProgress(progress.level, progress.exp);
        if (progress.levelsGained > 0) {
            this.restoreFull();
            this.runtime.owner.saveProgressSoon(this.runtime);
        }
        return { level: progress.level, levelsGained: progress.levelsGained };
    }

    /** Trừ tiền (mất tiền trong thoại...); `false` (không đổi gì) nếu không đủ. Lưu sớm ≤ 500 ms. */
    debitCurrency(costs: readonly CurrencyReward[]): boolean {
        return this.runtime.owner.debit(this.runtime, costs);
    }

    /** Hồi đầy HP/MP (lên level). */
    restoreFull() {
        this.hp = this.maxHp;
        this.mp = this.maxMp;
    }

    /** Vị trí / HP / MP / dungeon hiện tại, để `PlayerRuntime` lưu (autosave, lúc rời room / đổi map). */
    capturePlace(mapCode: string): PlaceCapture {
        // Trong dungeon (hoặc đang bước vào): lưu chỗ quay về — mất kết nối thì đăng nhập lại ở ngoài dungeon.
        const session = this.dungeonSession;
        return {
            // Đang chuyển map (portal/teleport): lưu map đích để rời room không ghi đè về map cũ.
            mapCode: session?.returnMapCode ?? this.pendingMapCode ?? mapCode,
            x: session?.returnX ?? (this.pendingMapCode ? this.pendingX : this.x),
            y: session?.returnY ?? (this.pendingMapCode ? this.pendingY : this.y),
            dungeonSession: session ? { ...session } : null,
            direction: this.direction as PlaceCapture["direction"],
            hp: this.hp,
            mp: this.mp,
        };
    }

    /**
     * Hiệu ứng của consumable có dùng được lúc `now` không (chưa đổi state). Command gọi cho mọi hiệu ứng trước khi trừ
     * item, nên item chỉ mất khi cả danh sách hiệu ứng đều dùng được.
     */
    checkConsumable(effect: ConsumableEffect, now: number): ErrorCode | undefined {
        switch (effect.type) {
            case ConsumableEffectType.RESTORE: {
                const usefulHp = effect.hp > 0 && this.hp < this.maxHp;
                const usefulMp = effect.mp > 0 && this.mp < this.maxMp;
                if (!usefulHp && !usefulMp) return ItemErrorCode.ITEM_ALREADY_FULL;
                if (
                    (usefulHp && now < this.hpPotionReadyAt) ||
                    (usefulMp && now < this.mpPotionReadyAt)
                ) {
                    return ItemErrorCode.ITEM_ON_COOLDOWN;
                }
                return undefined;
            }
        }
    }

    /** Áp dụng hiệu ứng consumable (đã `checkConsumable`): hồi HP / MP và đặt hồi chiêu bình. */
    applyConsumable(effect: ConsumableEffect, now: number): ConsumableGain {
        switch (effect.type) {
            case ConsumableEffectType.RESTORE: {
                const hpBefore = this.hp;
                const mpBefore = this.mp;
                if (effect.hp > 0 && this.hp < this.maxHp) {
                    this.hpPotionReadyAt = now + POTION_COOLDOWN_MS;
                    this.hp = Math.min(this.maxHp, this.hp + effect.hp);
                }
                if (effect.mp > 0 && this.mp < this.maxMp) {
                    this.mpPotionReadyAt = now + POTION_COOLDOWN_MS;
                    this.mp = Math.min(this.maxMp, this.mp + effect.mp);
                }
                this.syncPotionCooldowns(now);
                return { hp: this.hp - hpBefore, mp: this.mp - mpBefore };
            }
        }
    }

    /** Party hiện tại của player (global ghi vào `PlayerRuntime.party`): lúc vào room và mỗi khi đổi. */
    applyParty(party: PlayerPartyState | undefined) {
        this.setParty(party?.partyId ?? null);
        if (party) this.partyLootMode = party.lootMode;
    }

    /** Số item (theo code) trong bản sao túi. */
    itemCount(itemCode: string): number {
        return inventoryService.countByCode(this.inventories, itemCode);
    }

    /** Trạng thái quest (chưa nhận / đang làm / xong...) theo tiến độ hiện tại và số item đang có. */
    questState(questCode: string): QuestState {
        const quest = questOf(this, questCode);
        if (!quest) return QuestState.NOT_STARTED;
        return questProgressService.questStateOf(quest, this.quests[questCode], (code) =>
            this.itemCount(code)
        );
    }

    /** Ngữ cảnh để đánh giá điều kiện thoại / quest / vật thể tại map `mapCode`. */
    conditionContext(mapCode: string): ConditionContext {
        return {
            level: this.level,
            classCode: this.classCode,
            baseClassCode: this.baseClassCode,
            mapCode,
            flags: this.flags,
            questState: (code) => this.questState(code),
            itemCount: (code) => this.itemCount(code),
            currency: (code) =>
                (this.wallet as unknown as Record<string, { balance: number } | undefined>)[code]
                    ?.balance ?? 0,
        };
    }

    /** Đang đứng trong `radius` quanh (x, y) không. */
    isNear(x: number, y: number, radius: number): boolean {
        return Math.hypot(this.x - x, this.y - y) <= radius;
    }

    /** Hồi sinh tại điểm spawn của map (`game_maps.spawnX/spawnY`). */
    setSpawns(spawnX: number, spawnY: number) {
        this.x = spawnX;
        this.y = spawnY;
        this.moving = false;
        this.attacking = false;
        this.attackCombo = 0;
        this.castSlot = 0;
        this.hitInterrupted = false;
        this.targetId = "";
        this.targetLocked = false;
        this.dashing = false;
        this.hp = this.maxHp;
        this.attackCooldownTicks = 0;
        this.skillCooldownTicks = 0;
        this.skill1CooldownTicks = 0;
        this.skill2CooldownTicks = 0;
        this.skill3CooldownTicks = 0;
        this.clearCharge();
        this.dashTicks = 0;
        this.dashCooldownTicks = 0;
    }

    /** Bắt đầu đổi map: chốt vị trí hiện tại (đã đặt ở đích) làm vị trí lưu cho tới khi rời room. */
    beginMapChange(mapCode: string) {
        this.pendingMapCode = mapCode;
        this.pendingX = this.x;
        this.pendingY = this.y;
    }

    /** Đặt lại vị trí (chuyển map, vào/ra chamber): đứng yên và bỏ mục tiêu. */
    placeAt(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.moving = false;
        this.clearTarget();
    }

    clearTarget() {
        this.targetId = "";
        this.targetLocked = false;
    }

    setDead() {
        this.hp = 0;
        this.moving = false;
        this.attacking = false;
        this.attackCombo = 0;
        this.castSlot = 0;
        this.clearCharge();
        this.hitInterrupted = false;
        this.targetId = "";
        this.targetLocked = false;
        this.dashing = false;
    }

    /** Vị trí hỏng hoặc ngoài map (gốc ở giữa map: x ∈ ±width/2, y ∈ ±height/2) thì về điểm spawn. */
    recoverPosition(spawnX: number, spawnY: number, width: number, height: number) {
        const extent = mapExtent(width, height);
        if (!Number.isFinite(this.x) || this.x < extent.minX || this.x > extent.maxX)
            this.x = spawnX;
        if (!Number.isFinite(this.y) || this.y < extent.minY || this.y > extent.maxY)
            this.y = spawnY;
    }

    /** Bắt đầu đòn: khoá di chuyển `durationTicks`; đòn kế tiếp đợi lâu hơn trong `durationTicks` và `cooldownTicks` (cùng đếm từ lúc bắt đầu). */
    startAttack(durationTicks: number, cooldownTicks = 0) {
        this.attacking = true;
        this.castSlot = 0;
        this.attackCooldownTicks = durationTicks;
        this.skillCooldownTicks = Math.min(
            Math.max(durationTicks, cooldownTicks),
            MAX_SKILL_COOLDOWN_TICKS
        );
    }

    /**
     * Bắt đầu skill chủ động số `slot`: khoá di chuyển và mọi đòn khác `durationTicks`, còn skill đó chỉ
     * dùng lại được sau `cooldownTicks` kể từ lúc bắt đầu. Hồi đòn đánh thường đang chạy vẫn giữ nguyên.
     */
    startSkill(slot: number, durationTicks: number, cooldownTicks: number) {
        this.attacking = true;
        this.attackCombo = 0;
        this.castSlot = slot;
        this.attackCooldownTicks = durationTicks;
        this.skillCooldownTicks = Math.min(
            Math.max(this.skillCooldownTicks, durationTicks),
            MAX_SKILL_COOLDOWN_TICKS
        );
        this.setSkillCooldownTicks(slot, cooldownTicks);
    }

    /** Tick còn lại tới khi dùng lại được skill chủ động số `slot` (từ 1); slot không có thì 0. */
    getSkillCooldownTicks(slot: number): number {
        if (slot === 1) return this.skill1CooldownTicks;
        if (slot === 2) return this.skill2CooldownTicks;
        if (slot === 3) return this.skill3CooldownTicks;
        return 0;
    }

    setSkillCooldownTicks(slot: number, ticks: number) {
        const value = Math.min(Math.max(0, ticks), MAX_SKILL_COOLDOWN_TICKS);
        if (slot === 1) this.skill1CooldownTicks = value;
        else if (slot === 2) this.skill2CooldownTicks = value;
        else if (slot === 3) this.skill3CooldownTicks = value;
    }

    /** Mỗi step giảm 1 tick hồi chiêu của mọi skill chủ động. */
    tickSkillCooldowns() {
        if (this.skill1CooldownTicks > 0) this.skill1CooldownTicks--;
        if (this.skill2CooldownTicks > 0) this.skill2CooldownTicks--;
        if (this.skill3CooldownTicks > 0) this.skill3CooldownTicks--;
    }

    /**
     * Bắt đầu skill lướt số `slot`: khoá mọi đòn trong `chargeTicks` (thời gian lướt tối đa, đếm lùi bằng
     * `attackCooldownTicks`); chưa `attacking` — đòn chỉ bắt đầu khi chạm mục tiêu (`beginChargeStrike`).
     */
    startCharge(slot: number, targetId: string, chargeTicks: number, cooldownTicks: number) {
        this.attackCombo = 0;
        this.castSlot = slot;
        this.charging = true;
        this.chargeTargetId = targetId;
        this.attackCooldownTicks = Math.min(chargeTicks, 0xff);
        this.setSkillCooldownTicks(slot, cooldownTicks);
    }

    /** Chạm mục tiêu: hết lướt, bắt đầu đòn `durationTicks` (hồi đòn đánh thường đang chạy vẫn giữ). */
    beginChargeStrike(durationTicks: number) {
        this.clearCharge();
        this.attacking = true;
        this.attackCooldownTicks = durationTicks;
        this.skillCooldownTicks = Math.min(
            Math.max(this.skillCooldownTicks, durationTicks),
            MAX_SKILL_COOLDOWN_TICKS
        );
    }

    /** Dừng lướt (hết thời gian, mất mục tiêu): không ra đòn; hồi chiêu của skill giữ nguyên. */
    cancelCharge() {
        this.clearCharge();
        this.moving = false;
        this.attackCooldownTicks = 0;
        this.castSlot = 0;
    }

    clearCharge() {
        this.charging = false;
        this.chargeTargetId = "";
    }

    /** Dash / bị đánh trúng cắt đòn đang vung: bỏ phần khoá di chuyển còn lại; cooldown dài hơn lúc vung thì vẫn chạy tiếp. */
    cancelAttackLock() {
        if (this.skillCooldownTicks <= this.attackCooldownTicks) this.skillCooldownTicks = 0;
        this.attackCooldownTicks = 0;
    }

    chainDash(requested: boolean, tickRate: number) {
        if (requested && this.dashCooldownTicks === 0 && this.dashTicks === 0) {
            const dash = skillService.getByCode(DASH_SKILL_CODE);
            const cooldownMs = dash?.cooldownMs;
            this.dashTicks = Math.min(
                MAX_DASH_TICKS,
                millisecondsToTicks(dash?.animationMs, tickRate)
            );
            this.dashCooldownTicks = Math.min(
                MAX_DASH_TICKS,
                cooldownMs > 0 ? millisecondsToTicks(cooldownMs, tickRate) : 0
            );
        }

        this.dashing = this.dashTicks > 0;
        if (this.dashTicks > 0) this.dashTicks--;
        if (this.dashCooldownTicks > 0) this.dashCooldownTicks--;
    }

    toDamageCombatant(): DamageCombatant {
        return { id: this.id, stats: this.stats, hp: this.hp, maxHp: this.maxHp };
    }

    heal(amount: number) {
        if (this.hp <= 0 || amount <= 0) return;
        this.hp = Math.min(this.maxHp, this.hp + Math.floor(amount));
    }

    takeDamage(damage: number) {
        if (this.dashing) return;

        // Chỉ trừ máu: trúng đòn không khựng, không huỷ đòn đang đánh hay di chuyển.
        this.hp = Math.max(0, this.hp - Math.max(0, damage));
    }

    setParty(partyId: string | null) {
        this.partyId = partyId;
        this.inParty = !!partyId;
    }
}
