# Party room

```text
party/
  party.room.ts
  party.shared.ts           # Public DTOs, enums and pure helpers/directory access
  constants/
  types/                    # RPC and client message DTOs
  commands/                 # Create/join/leave lifecycle
  services/                 # Loot/exp split, directory
  schemas/                  # PartyState (synced state + party rules) and party DTOs
  modules/
    members/
      commands/
      services/
      validators/
      schemas/              # PartyMemberState
    loot/
      commands/
      services/             # Cursor and idempotent reward allocation
      validators/
```

The room owns membership, leadership, invitation expiry, loot mode and the loot
cursor. Runtime state is per room; no process-global party cursor exists.
Party keeps lightweight member snapshots, not live player/world schemas.

Party has no database entity/repository, so its logic and DTOs live here rather
than in `src/modules`. Peer rooms use `party.shared.ts` for DTOs, enums and pure
helpers/directory access, and the RPC command classes (called with `callRoom`). They cannot import this
room's runtime, state or private services directly. Requests have a three-second
timeout through `src/core/rooms/room.integration.ts`.

`party_config` is persisted master data: its Zod schema lives in
`src/modules/master-data/schemas/party-config.schema.ts`, and its loot-mode enum in
`src/modules/master-data/enums/party-loot-mode.enum.ts`. The party schema re-exports
them for room-side usage; master-data does not import room code.

`DungeonPartyCoordinator` asks party for an eligible group snapshot, preflights
each world, creates one instance ID, and requests transfers. Worlds recheck live
conditions before transferring. A change or failure during transfer is reported
to the group; the cross-room operation is not an atomic transaction.

Reward allocation uses stable party join order and an event ID. The last 1,024
allocations are retained for retry deduplication. Worlds apply rewards and quest
progress, and drain pending allocations before saving/leaving. If the party cannot
allocate after a retry, world preserves the reward using shared formulas with
killer item ownership; the transport logs the failure.

Membership notifications carry a source party and revision; reports carry a
source world and revision. Old or duplicate updates are ignored. Party refreshes
its own directory entries; world only refreshes its online location.

Each command class has its own file. Lifecycle, invite/kick/promote/disband and
loot-mode handlers execute in commands; expiry and heartbeat timers also dispatch
commands, including RPC calls from other rooms. `PartyRoom` holds the runtime maps;
notification and membership helpers live in `services/party-notify.ts` and
`services/party-membership.ts`.
See [command conventions](../../../docs/room-command-pattern.md).
