import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Input di chuyển client → server, 1 frame / 1 fixed step (Colyseus Netcode `defineInput`).
 * Input schema phải phẳng: chỉ field primitive.
 */
export const MoveInput = schema(
    {
        /** -1 trái, 0 đứng, 1 phải. */
        moveX: t.int8(),
        /** -1 lên, 0 đứng, 1 xuống (trục y hướng xuống như toạ độ tile). */
        moveY: t.int8(),
    },
    "MoveInput"
);
export type MoveInput = SchemaType<typeof MoveInput>;
