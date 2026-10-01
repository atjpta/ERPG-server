import { Schema, type } from "@colyseus/schema";

import { PLAYER_BASE_STATS } from "@/modules/player/constants/player.constant.js";
import type { PlayerSnapshot } from "@/modules/player/user/services/player.service.js";

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
    @type("float32") moveSpeed: number;
    @type("uint32") attack: number;
    @type("uint32") defense: number;
    @type("uint32") stateRevision: number;
    @type("uint8") attackCooldownTicks: number = 0;
    @type("boolean") dashing: boolean = false;
    @type("uint8") dashTicks: number = 0;
    @type("uint8") dashCooldownTicks: number = 0;
    @type("boolean") attacking: boolean = false;

    constructor(props: { player: PlayerSnapshot }) {
        const { player } = props;
        super();
        this.id = player.id;
        this.name = player.name;
        this.level = player.level;
        this.x = player.x;
        this.y = player.y;
        this.direction = player.direction;
        this.hp = PLAYER_BASE_STATS.maxHp;
        this.maxHp = PLAYER_BASE_STATS.maxHp;
        this.mp = player.mp;
        this.moveSpeed = PLAYER_BASE_STATS.moveSpeed;
        this.attack = PLAYER_BASE_STATS.attack;
        this.defense = PLAYER_BASE_STATS.defense;
        this.stateRevision = player.stateRevision;
    }

    setSpawns() {
        this.x = 0;
        this.y = 0;
        this.moving = false;
        this.attacking = false;
        this.dashing = false;
        this.hp = this.maxHp;
        this.attackCooldownTicks = 0;
        this.dashTicks = 0;
        this.dashCooldownTicks = 0;
    }

    setDead() {
        this.hp = 0;
        this.moving = false;
        this.attacking = false;
        this.dashing = false;
    }

    recoverPosition(spawnX: number, spawnY: number, width: number, height: number) {
        if (!Number.isFinite(this.x) || this.x < 0 || this.x > width) this.x = spawnX;
        if (!Number.isFinite(this.y) || this.y < 0 || this.y > height) this.y = spawnY;
    }

    startAttack(cooldownTicks: number) {
        this.attacking = true;
        this.attackCooldownTicks = cooldownTicks;
    }

    chainDash(requested: boolean) {
        if (requested && this.dashCooldownTicks === 0 && this.dashTicks === 0) {
            this.dashTicks = 6;
            this.dashCooldownTicks = 12;
        }

        this.dashing = this.dashTicks > 0;
        if (this.dashTicks > 0) this.dashTicks--;
        if (this.dashCooldownTicks > 0) this.dashCooldownTicks--;
    }

    takeDamage(damage: number) {
        this.hp = Math.max(0, this.hp - Math.max(0, damage));
    }

    syncSnapshot(player: PlayerSnapshot) {
        this.x = player.x;
        this.y = player.y;
        this.direction = player.direction;
        this.hp = player.hp;
        this.mp = player.mp;
        this.stateRevision = player.stateRevision;
        this.moving = false;
    }

    setStateRevision(revision: number) {
        this.stateRevision = revision;
    }
}
