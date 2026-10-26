/** Đứng xa hơn bán kính mở thoại cộng chừng này thì đóng thoại. */
export const RANGE_MARGIN = 0.5;

export interface DialogueSessionProps {
    /** NPC code (client biết nói chuyện với ai). */
    sourceCode: string;
    /** NPC đang nói chuyện (cho action `open_function`, trả quest). */
    npcCode: string;
    /** Id slot của NPC / vật thể trong map (vị trí, chức năng riêng của chỗ đặt). */
    slotId: string;
    dialogueCode: string;
    nodeId: string;
    x: number;
    y: number;
    radius: number;
}

/** Cuộc thoại đang mở của 1 player (chỉ ở server — client chỉ gửi optionId). */
export class DialogueSessionState {
    readonly sourceCode: string;
    readonly npcCode: string;
    readonly slotId: string;
    readonly dialogueCode: string;
    nodeId: string;
    readonly x: number;
    readonly y: number;
    readonly radius: number;

    constructor(props: DialogueSessionProps) {
        this.sourceCode = props.sourceCode;
        this.npcCode = props.npcCode;
        this.slotId = props.slotId;
        this.dialogueCode = props.dialogueCode;
        this.nodeId = props.nodeId;
        this.x = props.x;
        this.y = props.y;
        this.radius = props.radius;
    }

    /** Chuyển sang node `nodeId`. */
    goTo(nodeId: string) {
        this.nodeId = nodeId;
    }

    /** Player còn đứng trong tầm nói chuyện (bán kính mở thoại cộng `RANGE_MARGIN`) không. */
    isNear(player: { isNear(x: number, y: number, range: number): boolean }): boolean {
        return player.isNear(this.x, this.y, this.radius + RANGE_MARGIN);
    }
}

/** Các cuộc thoại đang mở của một room, theo playerId. */
export class DialogueSessionsState {
    private readonly sessions = new Map<string, DialogueSessionState>();

    get size(): number {
        return this.sessions.size;
    }

    start(playerId: string, props: DialogueSessionProps): DialogueSessionState {
        const session = new DialogueSessionState(props);
        this.sessions.set(playerId, session);
        return session;
    }

    get(playerId: string): DialogueSessionState | undefined {
        return this.sessions.get(playerId);
    }

    has(playerId: string): boolean {
        return this.sessions.has(playerId);
    }

    /** Đóng cuộc thoại của player (rời room, quá xa, kết thúc). */
    drop(playerId: string): void {
        this.sessions.delete(playerId);
    }

    [Symbol.iterator](): IterableIterator<[string, DialogueSessionState]> {
        return this.sessions.entries();
    }
}
