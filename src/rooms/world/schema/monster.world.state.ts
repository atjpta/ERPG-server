import { MonsterStatus } from "@/modules/monsters/entities/enums/monster-status.enum.js";
import { Monster } from "@/modules/monsters/entities/monster.entity.js";
import { Direction } from "@/modules/player/enums/player.enum.js";
import { Schema, type } from "@colyseus/schema";
import { v7 as uuidv7 } from "uuid";

export class MonsterWorldState extends Schema {
    @type("string") id: string;
    @type("string") MonsterId: string;
    @type("string") code: string;
    @type("uint16") level: number;
    @type("float32") x: number;
    @type("float32") y: number;
    @type("float32") spawnX: number;
    @type("float32") spawnY: number;
    @type("string") direction: Direction = Direction.LEFT;
    @type("string") status: MonsterStatus = MonsterStatus.ALIVE;
    @type("boolean") moving: boolean = false;
    @type("boolean") attacking: boolean = false;
    @type("uint32") hp: number;
    @type("uint32") maxHp: number;
    @type("uint32") attack: number;
    @type("uint32") defense: number;
    @type("float32") moveSpeed: number;
    @type("float32") attackRange: number;
    @type("uint32") attackCooldownMs: number;
    @type("uint16") attackCooldownTicks: number = 0;

    constructor(props: { monster: Monster; x: number; y: number }) {
        const { monster, x, y } = props;
        super();
        this.id = uuidv7();
        this.MonsterId = monster.id;
        this.code = monster.code;
        this.level = monster.level;
        this.x = x;
        this.y = y;
        this.spawnX = x;
        this.spawnY = y;
        this.hp = monster.maxHp;
        this.maxHp = monster.maxHp;
        this.attack = monster.attack;
        this.defense = monster.defense;
        this.moveSpeed = monster.moveSpeed;
        this.attackRange = monster.attackRange;
        this.attackCooldownMs = monster.attackCooldownMs;
        this.attackCooldownTicks = 0;
    }

    setDead() {
        this.status = MonsterStatus.DEAD;
        this.moving = false;
        this.attacking = false;
        this.hp = 0;
    }

    setSpawns() {
        this.status = MonsterStatus.ALIVE;
        this.x = this.spawnX;
        this.y = this.spawnY;
        this.direction = Direction.LEFT;
        this.moving = false;
        this.attacking = false;
        this.hp = this.maxHp;
        this.attackCooldownTicks = 0;
    }

    faceTarget(dx: number, dy: number) {
        this.moving = false;
        if (dx < 0) this.direction = Direction.LEFT;
        else if (dx > 0) this.direction = Direction.RIGHT;
        else this.direction = dy < 0 ? Direction.UP : Direction.DOWN;
    }

    startAttack(cooldownTicks: number) {
        this.attacking = true;
        this.attackCooldownTicks = cooldownTicks;
    }

    startAttackWindup() {
        this.moving = false;
        this.attacking = true;
    }

    takeDamage(damage: number) {
        this.hp = Math.max(0, this.hp - Math.max(0, damage));
    }
}
