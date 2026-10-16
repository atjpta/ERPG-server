export enum WorldChainResult {
    CONTINUE,
    STOP,
}

export interface WorldChainAction<TContext> {
    execute(context: TContext): WorldChainResult;
}

export class WorldChain<TContext> {
    constructor(private readonly actions: readonly WorldChainAction<TContext>[]) {}

    execute(context: TContext): void {
        for (const action of this.actions) {
            if (action.execute(context) === WorldChainResult.STOP) return;
        }
    }
}
