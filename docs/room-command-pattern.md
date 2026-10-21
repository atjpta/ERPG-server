# Room commands

Each concrete or abstract command class lives in its own `*.command.ts` file.
Use names such as `invite.party.command.ts`, `enhance-equipment.world.command.ts`
and `on-create.party.command.ts`.

Room handlers dispatch commands. `validate()` owns the synchronous gate: payload
parsing, player/target lookup, access and state checks. When it rejects it sends the
failure response itself (or sets `result` for RPC commands) and returns `false`;
otherwise it keeps what it resolved in private fields. `execute()` owns the action's
mutations, awaited checks that cannot run in `validate()`, and its response sequence. Private methods
may break up that action within the same command. Inventory commands share an
abstract command for validation, response messages and persistence; each concrete
command owns its operation in `run()`.

Commands of a player in a room extend `PlayerCommand` (`core/rooms/player.command.ts`),
usually through a thin per-room base: `PlayerWorldCommand` (`this.player` is
`PlayerWorldState`) or `PlayerPartyCommand` (`this.player` is the member's `playerId`). A new
room only defines `findPlayer()`. Before the command's own `validate()` the base always runs
the shared part: it resolves `this.player` (silently rejects if the player is not in the room)
and, when the command declares `validateSchema`, parses the payload into `this.body`. An invalid
payload sends `INVALID_INPUT` on `replyType` (with `invalidError` as `error`), or is dropped
silently when `replyType` is not declared. The command's own `validate()` only holds its
remaining checks (state, permissions): send the error and return `false`. `execute()` uses
`this.player` / `this.body`.

Client message commands declare `static readonly message = SomeClientMessage.KEY`.
Room modules call `loadRoomMessages()` at module scope to discover commands
recursively within their own directory, then assign the returned map to the room's
`messages` property. Colyseus binds/registers the handlers for each instance.
Do not maintain a manual `messages` map.
Lifecycle, timer and abstract commands have no static message key. See the
[Vietnamese registration guide](room-messages.md).

Services contain processing reused by multiple actions or a public capability
needed elsewhere: state synchronization, notifications, dialogue sessions,
inventory grants, equipment lookup/payment/update, persistence, and RPC queries.
Do not create a service method solely to hold one command's handler.

For the installed `@colyseus/command` implementation:

- Dispatch injects `room`, `state` and `clock`; do not call `execute()` directly.
- `validate()` is a synchronous boolean gate run before `execute()`; returning
  `false` skips `execute()` and the dispatcher sends nothing, so `validate()` must
  send the error reply (or set `result`) itself. Checks that need `await`, or that
  must be revalidated after an `await`, stay in `execute()`.
- Return `void`, another command, or an array of commands, optionally through a
  promise. Set child payloads with `setPayload()`. The dispatcher awaits those
  child commands in order.
- Do not return business DTOs or `InventoryResult` from `execute()`; they would
  be interpreted as child commands. Inventory `run()` results are consumed by
  the abstract command and are not returned to the dispatcher.
- `dispatch()` does not return a business result and does not serialize separate
  top-level calls. Recheck mutable assumptions after asynchronous work when an
  operation requires them.
- RPC methods (called through `matchMaker.remoteRoomCall`) also run in commands. A
  command that must return data declares a `result` field and assigns it in
  `execute()` (which still returns `void`); the room method uses
  `callRoom(roomId, XCommand, payload)`; the target room lists its RPC commands in `createRpcRunner(this, [...])`, which uses `dispatchForResult` from
  `core/utils/dispatch-result.util.ts` to read it back. RPC commands have no
  `static message`, so `loadRoomMessages()` ignores them.

Party lifecycle, RPC, invitation, membership and loot-mode actions follow this rule.
Expiry and heartbeat timers dispatch separate commands. World action handlers
and previews live in their command classes; common room/tick capabilities stay
available to other callers through services.
