import type { ErrorCode } from "@/core/types/result.type.js";
import { playerSnapshotWorldService } from "@/rooms/world/modules/players/services/player-snapshot.world.service.js";
import { playerStatsWorldService } from "@/rooms/world/modules/players/services/player-stats.world.service.js";
import { ArraySchema, Schema, type } from "@colyseus/schema";

import { big, floorBig, roundBig } from "@/core/utils/big-number.util.js";
import { classBody } from "@/modules/bodies/services/entity-body.service.js";
import { classService } from "@/modules/classes/services/class.service.js";
import type { FlagValue } from "@/modules/dialogues/schemas/condition.schema.js";
import type { DungeonSession } from "@/modules/maps/entities/game-map.entity.js";
import type { PlayerState } from "@/modules/player/entities/player-state.entity.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import {
    toInventories,
    type Equipments,
    type Inventories,
} from "@/modules/player/schemas/inventory.schema.js";
import type { AttributeKey, Attributes, Stats } from "@/modules/player/schemas/stat.schema.js";
import type { Wallet } from "@/modules/player/schemas/wallet.schema.js";
import type { PlayerSnapshot } from "@/modules/player/types/player.type.js";
import type { PlayerDailyQuests } from "@/modules/quests/schemas/daily-quest.schema.js";
import type { PlayerQuests } from "@/modules/quests/schemas/quest.schema.js";
import { DASH_SKILL_CODE, skillService } from "@/modules/skills/services/skill.service.js";
import { PartyLootMode } from "@/rooms/party/party.shared.js";
import { mapExtent } from "@/rooms/world/modules/players/simulation/movement.step.js";
import type { DamageCombatant } from "@/rooms/world/modules/combat/chains/damage.world.chain.js";
import { HitboxColliderState } from "@/rooms/world/modules/combat/schemas/hitbox-collider.world.state.js";
import {
    OwnedSkillState,
    toOwnedSkillStates,
} from "@/rooms/world/modules/players/schemas/owned-skill.world.state.js";
import { millisecondsToTicks } from "@/rooms/world/utils/tick.world.util.js";
import type { AttributesMessage } from "@/rooms/world/types/world-message.type.js";

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
    @type("uint32") maxHp: number;
    @type("uint32") mp: number;
    @type("uint32") maxMp: number;
    @type("float32") moveSpeed: number;
    @type("uint32") attack: number;
    @type("uint32") defense: number;
    @type("uint32") stateRevision: number;
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

    wallet: Wallet;
    /** Cờ cốt truyện và quest (server-only) — xem `player_states.flags/quests`. */
    flags: Record<string, FlagValue>;
    quests: PlayerQuests;
    /** Quest hằng ngày đã sinh cho hôm nay (server-only). */
    dailyQuests: PlayerDailyQuests | null = null;
    /** Map đích khi đã bước vào portal/teleport và đang đợi client vào room mới. */
    pendingMapCode?: string;
    /** Vị trí đích chốt lúc bắt đầu đổi map — room cũ còn simulate player tới khi client rời, không được để nó ghi đè vị trí lưu. */
    private pendingX = 0;
    private pendingY = 0;
    private _partyRoomId: string | null = null;
    /** Room party đang tham gia (server-only) — dùng chia exp / quest cho thành viên cùng room. Gán là cập nhật luôn `inParty`. */
    get partyRoomId(): string | null {
        return this._partyRoomId;
    }
    set partyRoomId(value: string | null) {
        this._partyRoomId = value;
        this.inParty = !!value;
    }
    /** Cách chia item của party hiện tại (do chủ chọn; party room đẩy xuống). */
    partyLootMode: PartyLootMode = PartyLootMode.ROUND_ROBIN;
    /** Làng gần nhất đã đến (server-only) — chết trong dungeon thì hồi sinh ở đây. */
    lastTownMapCode: string | null = null;
    /** Lượt dungeon đang diễn ra (từ lúc bước vào portal dungeon tới khi thoát ra). */
    dungeonSession?: DungeonSession;
    attributePoints: number;
    /** `elapsedTime` (ms) của room tới lúc được dùng bình HP / MP tiếp theo (mỗi loại bình một hồi chiêu). */
    hpPotionReadyAt = 0;
    mpPotionReadyAt = 0;
    /** Giây còn lại của hồi chiêu bình HP / MP (0 = dùng được) — để client hiện đếm ngược. */
    @type("uint8") hpPotionCooldownSec = 0;
    @type("uint8") mpPotionCooldownSec = 0;
    /** Đang trong party hay không — client dùng để chọn "mời" hay "xin vào party" ở menu người chơi (id room party vẫn server-only). */
    @type("boolean") inParty = false;
    classId: string;
    allocatedAttributes: Attributes;
    equipments: Equipments;
    /** 3 túi inventory theo ItemType (server-only, gửi client qua message `inventory`). */
    inventories: Inventories;
    attributes: Attributes;
    stats: Stats;
    /** Tăng mỗi đòn đánh — một phần seed roll combat (`combatSeed`). */
    attackSerial = 0;
    skillPoints: number;
    /** Phần HP/MP hồi lẻ (< 1) cộng dồn giữa các tick. */
    private hpRegenCarry = big(0);
    private mpRegenCarry = big(0);

    constructor(props: { player: PlayerSnapshot }) {
        const { player } = props;
        super();
        this.id = player.id;
        this.name = player.name;
        this.level = player.level;
        this.x = player.x;
        this.y = player.y;
        this.direction = player.direction === "left" ? "left" : "right";
        this.classId = player.classId;
        this.classCode = classService.getById(player.classId)?.code ?? "";
        this.baseClassCode = this.classCode ? classService.getBaseClassCode(this.classCode) : "";
        this.allocatedAttributes = { ...player.allocatedAttributes };
        this.equipments = structuredClone(player.equipments);
        this.inventories = structuredClone(toInventories(player));
        this.refreshStats();
        this.hp = this.maxHp;
        this.mp = player.mp;
        this.stateRevision = player.stateRevision;
        // The body follows the class prefab in Unity (not the row, which holds what it was when the character was made).
        const body = classBody(this.classCode, this.baseClassCode);
        this.hitbox = new HitboxColliderState(body?.hitbox ?? player.hitbox);
        this.collider = new HitboxColliderState(body?.collider ?? player.collider);
        this.skills.push(...toOwnedSkillStates(player.skills));
        this.applyProgress(player);
    }

    /** Level, exp, ví tiền, điểm chưa dùng — từ DB (lúc vào room / sau khi đồng bộ lại). */
    private applyProgress(player: PlayerSnapshot) {
        return playerSnapshotWorldService.applyProgress(this, player);
    }

    setLevelProgress(level: number, exp: number) {
        return playerStatsWorldService.setLevelProgress(this, level, exp);
    }

    refreshStats() {
        return playerStatsWorldService.refreshStats(this);
    }

    /** Cộng điểm tiềm năng; trả `ErrorCode` lỗi nếu không hợp lệ, `undefined` khi thành công. */
    allocateAttributes(request: Partial<Record<AttributeKey, number>>): ErrorCode | undefined {
        return playerStatsWorldService.allocateAttributes(this, request);
    }

    /** Kết quả nếu cộng điểm như `request` — không đổi state; trả `ErrorCode` lỗi nếu không hợp lệ. */
    previewAttributes(
        request: Partial<Record<AttributeKey, number>>
    ): AttributesMessage | ErrorCode {
        return playerStatsWorldService.previewAttributes(this, request);
    }

    getAttributeSummary(): AttributesMessage {
        return playerStatsWorldService.getAttributeSummary(this);
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

    /** Hồi đầy HP/MP (lên level). */
    restoreFull() {
        this.hp = this.maxHp;
        this.mp = this.maxMp;
    }

    /** Phần state được lưu xuống DB (checkpoint định kỳ và lúc rời room). */
    toSavedState(
        mapCode: string
    ): Pick<
        PlayerState,
        | "mapCode"
        | "x"
        | "y"
        | "direction"
        | "hp"
        | "mp"
        | "level"
        | "exp"
        | "wallet"
        | "attributePoints"
        | "skillPoints"
        | "allocatedAttributes"
        | "equipments"
        | "equipmentInventory"
        | "consumableInventory"
        | "materialInventory"
        | "flags"
        | "quests"
        | "lastTownMapCode"
        | "dungeonSession"
        | "dailyQuests"
    > {
        return playerSnapshotWorldService.toSavedState(this, mapCode, {
            x: this.pendingX,
            y: this.pendingY,
        });
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
        if (!Number.isFinite(this.x) || this.x < extent.minX || this.x > extent.maxX) this.x = spawnX;
        if (!Number.isFinite(this.y) || this.y < extent.minY || this.y > extent.maxY) this.y = spawnY;
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

    syncSnapshot(player: PlayerSnapshot) {
        return playerSnapshotWorldService.syncSnapshot(this, player);
    }

    setStateRevision(revision: number) {
        this.stateRevision = revision;
    }
}
