import {
    DIALOGUE_START_NODE,
    type DialogueNode,
} from "@/modules/dialogues/schemas/dialogue.schema.js";

/** Kiểm tra đồ thị thoại; trả danh sách lỗi (rỗng = hợp lệ). */
export const validateDialogueGraph = (nodes: readonly DialogueNode[]): string[] => {
    const errors: string[] = [];
    const ids = new Set<string>();
    for (const node of nodes) {
        if (ids.has(node.id)) errors.push(`duplicate node "${node.id}"`);
        ids.add(node.id);
    }
    if (!ids.has(DIALOGUE_START_NODE)) errors.push(`missing "${DIALOGUE_START_NODE}" node`);

    const edges = (node: DialogueNode): string[] => [
        ...(node.next ? [node.next] : []),
        ...(node.options ?? []).flatMap((option) => (option.next ? [option.next] : [])),
    ];

    for (const node of nodes) {
        const optionIds = new Set<string>();
        for (const option of node.options ?? []) {
            if (optionIds.has(option.id)) errors.push(`duplicate option "${node.id}.${option.id}"`);
            optionIds.add(option.id);
        }
        if (node.next && node.options?.length) {
            errors.push(`node "${node.id}" has both next and options`);
        }
        for (const target of edges(node)) {
            if (!ids.has(target)) errors.push(`"${node.id}" points to unknown node "${target}"`);
        }
    }

    // Node không với tới được từ start là dữ liệu thừa hoặc nhầm id.
    if (ids.has(DIALOGUE_START_NODE)) {
        const byId = new Map(nodes.map((node) => [node.id, node]));
        const seen = new Set<string>([DIALOGUE_START_NODE]);
        const stack = [DIALOGUE_START_NODE];
        while (stack.length > 0) {
            const node = byId.get(stack.pop()!);
            if (!node) continue;
            for (const target of edges(node)) {
                if (!seen.has(target)) {
                    seen.add(target);
                    stack.push(target);
                }
            }
        }
        for (const id of ids) if (!seen.has(id)) errors.push(`node "${id}" is unreachable`);
    }
    return errors;
};

/** Key locale mặc định — client tra bảng text theo key này. */
export const nodeTextKey = (dialogueCode: string, node: DialogueNode) =>
    node.textKey ?? `dialogue.${dialogueCode}.${node.id}.text`;

export const optionTextKey = (
    dialogueCode: string,
    nodeId: string,
    option: { id: string; textKey?: string }
) => option.textKey ?? `dialogue.${dialogueCode}.${nodeId}.opt.${option.id}`;
