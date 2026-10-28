# World folder map

Both projects group World code by feature. Server folders use lowercase; Unity folders use PascalCase.

| Server: `src/rooms/world`                  | Unity: `Assets/ERPG/Scripts/Rooms/World` | Responsibility                                                                 |
| ------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `chains/`, `enums/`, `services/`, `utils/` | `Core/`                                  | Shared chain, error codes, tick and world helpers (lifecycle: `world.room.ts`) |
| `modules/players/`                         | `Players/`                               | Player state processing, movement; client input and prediction                 |
| `modules/monsters/`                        | `Monsters/`                              | Monster chains and services; client monster prefabs                            |
| `modules/combat/`                          | `Combat/`                                | Skills, attacks, hitboxes, configuration; client skill effects                 |
| `modules/maps/`                            | `Maps/`                                  | Map transfers; client map data, collision, validation and prefabs              |
| `modules/content/`                         | `Content/`                               | NPCs, interactions, dialogue, quests and world props                           |
| `modules/dungeons/`                        | `Dungeons/`                              | Dungeon sessions, rewards and client gates                                     |
| `modules/rewards/`                         | `Rewards/`                               | Reward delivery and client reward messages/popups                              |
| `modules/consumables/`                     | —                                        | `useItem` (potions) only; the bag itself lives in global `player-data`         |
| —                                          | `Presentation/`                          | Shared client character views, cameras, prefab infrastructure and debug        |

Within a feature, use `chains/Chains`, `commands/Commands`, `services/Services`,
`utils/Utils`, `validators/Validators` and `simulation/Simulation` according to role.
Client-only folders such as `Input`, `Views`, `Models` and `Messages` belong inside their feature.
Create folders only when they contain code; the two runtimes do not need placeholder files.

## Counterparts

| Server file                                                      | Unity file                                   |
| ---------------------------------------------------------------- | -------------------------------------------- |
| `chains/world.chain.ts`                                          | `Core/Chains/WorldChain.cs`                  |
| `world.room.ts` (`onJoin`)                                       | `Core/Commands/OnJoinWorldCommand.cs`        |
| `world.room.ts` (`releasePlayer`)                                | `Core/Commands/OnLeaveWorldCommand.cs`       |
| `services/world.service.ts`                                      | `Core/Services/WorldService.cs`              |
| `modules/players/chains/player.world.chain.ts`                   | `Players/Chains/PlayerWorldChain.cs`         |
| `modules/players/services/player.world.service.ts`               | `Players/Services/PlayerWorldService.cs`     |
| `modules/players/simulation/movement.step.ts`                    | `Players/Simulation/WorldMovementStep.cs`    |
| `modules/monsters/chains/monster.world.chain.ts`                 | `Monsters/Chains/MonsterWorldChain.cs`       |
| `modules/monsters/services/monster.world.service.ts`             | `Monsters/Services/MonsterWorldService.cs`   |
| `modules/combat/utils/skill-attack.world.util.ts`                | `Combat/Utils/SkillAttackWorldUtil.cs`       |
| `modules/combat/utils/skill-hitbox.world.util.ts`                | `Combat/Utils/SkillHitboxWorldUtil.cs`       |
| `modules/combat/commands/request-skill-configs.world.command.ts` | `Combat/Services/WorldSkillConfigRequest.cs` |
| `utils/tick.world.util.ts`                                       | `Core/Utils/TickWorldUtil.cs`                |
| `utils/world.util.ts`                                            | `Core/Utils/WorldUtil.cs`                    |

Room entry points stay at the World root. Public message enums/DTOs live in
`types/world-message.type.ts`; room creation options live in `types/world-room.type.ts`.
The client config export imports `buildClientSkillConfig` directly from `modules/combat/utils`. Cross-room calls (dungeon launch) go through `rooms/bus` (`callRoom`): the world room answers them in its `rpc` handlers.
Room lifecycle and tick orchestration are in `world.room.ts`; the base command is `player.world.command.ts`; world helpers live directly under this folder.
DTOs sent to the client are `modules/<feature>/interfaces/*.world.message.ts`, enums are in `enums/`; `types/world-message.type.ts` keeps only the two message enums.
Feature implementations live under `modules/<feature>/`. These are world-runtime modules;
`src/modules` remains the shared business/data layer used by both HTTP APIs and rooms.
Keep generic infrastructure in `src/core`; shared business logic belongs in `src/modules`.
Feature message handlers belong in commands, with payload schemas in their own feature validators.
The room wires monster-death handling to rewards so combat does not import party services.
Player schemas delegate stat calculation and persistence mapping to player services.
Player data (wallet, bags, equipment, points, level/exp, quests, flags, position) lives in one `PlayerState` per online player
(`src/rooms/global/modules/player-data`), shared with the global room. `PlayerWorldState` exposes it through getters (no copy) and keeps only the
tick-by-tick fields (position, hp/mp, cooldowns) in the Schema; the room registers `capturePlace` so the replica can back them up to global (autosave,
leaving, map change). Wallet changes go through `room.players.credit/debit`, items and points through `PlayerWorldState.applyOps`
(synchronous, atomic, saved within 500 ms); the global room pushes `inventoryChanged` when the runtime emits `bagChanged`.
Colyseus schemas live in `src/modules/<feature>/state/`: player (`PlayerWorldState`, `MoveWorldInput`),
owned skills in skills, monsters in monsters, NPCs and map objects (portals, teleport pads, gatherables) in npcs, dungeon state in maps,
hitboxes / projectiles / areas / auras in combat, and the aggregate `WorldState` in world.
`scripts/generate-room-schemas.mjs` discovers them recursively in `src/rooms` and `src/modules`. Generated Unity schemas stay in `Assets/ERPG/Scripts/Network/Schema`.
Do not manually move or edit generated C# schemas to match feature folders.

C# namespaces stay `ERPG.Rooms.World`; moving scripts must preserve their `.meta` GUIDs.
Update server import paths and client source-reference comments when moving shared logic.

World and global implementations must not import each other's internal files.
World does not import the global room: shared DTOs and enums live in `src/modules`, and to ask global for something it calls `rooms/bus` (`callRoom`) and reads player data through `PlayerStateManager.of(serverId)`.
Parties are owned by the global room (client party requests go to `global`, not to world); world only
reports presence (`room.players.setPresence/clearPresence` in `onJoin` and `WorldService.releasePlayer`) and remembers which
party each player is in (`PlayerWorldState.partyId`, synced to clients so same-map teammates read each
other's level/HP from world state; nothing about HP/level goes to global; the global room writes `PlayerState.party`). Dungeon admission belongs to the world dungeon module and is launched
through `launchDungeon`; kill rewards/quest application belong to rewards.
Shared player lookup, snapshot mapping/application live in
`modules/players/services/player-party.world.service.ts`; there is no separate
world-party integration layer.
Only the global room owns membership and loot mode; the world computes kill-reward shares itself and keeps the round-robin cursor per (room, party).

Each command class lives in its own file and owns its action's handling. Inventory
commands share an abstract command for validation, responses and persistence;
their operation runs in the concrete command. Services hold processing reused by
other actions or callers. See [command conventions](../../../docs/room-command-pattern.md).
