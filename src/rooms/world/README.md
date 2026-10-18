# World folder map

Both projects group World code by feature. Server folders use lowercase; Unity folders use PascalCase.

| Server: `src/rooms/world`                     | Unity: `Assets/ERPG/Scripts/Rooms/World` | Responsibility                                                          |
| --------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `chains/`, `commands/`, `services/`, `utils/` | `Core/`                                  | Room lifecycle, shared chain, tick and world helpers                    |
| `modules/players/`                            | `Players/`                               | Player state processing, movement; client input and prediction          |
| `modules/monsters/`                           | `Monsters/`                              | Monster chains and services; client monster prefabs                     |
| `modules/combat/`                             | `Combat/`                                | Skills, attacks, hitboxes, configuration; client skill effects          |
| `modules/maps/`                               | `Maps/`                                  | Map transfers; client map data, collision, validation and prefabs       |
| `modules/content/`                            | `Content/`                               | NPCs, interactions, dialogue, quests and world props                    |
| `modules/dungeons/`                           | `Dungeons/`                              | Dungeon sessions, rewards and client gates                              |
| `modules/rewards/`                            | `Rewards/`                               | Reward delivery and client reward messages/popups                       |
| `modules/inventory/`                          | —                                        | Server inventory commands and validation                                |
| —                                             | `Presentation/`                          | Shared client character views, cameras, prefab infrastructure and debug |

Within a feature, use `chains/Chains`, `commands/Commands`, `services/Services`,
`utils/Utils`, `validators/Validators` and `simulation/Simulation` according to role.
Client-only folders such as `Input`, `Views`, `Models` and `Messages` belong inside their feature.
Create folders only when they contain code; the two runtimes do not need placeholder files.

## Counterparts

| Server file                                                      | Unity file                                   |
| ---------------------------------------------------------------- | -------------------------------------------- |
| `chains/world.chain.ts`                                          | `Core/Chains/WorldChain.cs`                  |
| `commands/on-join.world.command.ts`                              | `Core/Commands/OnJoinWorldCommand.cs`        |
| `commands/on-leave.world.command.ts`                             | `Core/Commands/OnLeaveWorldCommand.cs`       |
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
`world.shared.ts` exports those types/enums and the reusable `buildClientSkillConfig`
builder used by client config exports. External consumers use this public entrypoint
instead of importing feature implementation files. Its RPC commands are listed in `createRpcRunner` in `world.room.ts`.
Room lifecycle, tick orchestration and world helpers live directly under this folder.
Feature implementations live under `modules/<feature>/`. These are world-runtime modules;
`src/modules` remains the shared business/data layer used by both HTTP APIs and rooms.
Keep generic infrastructure in `src/core`; shared business logic belongs in `src/modules`.
Feature message handlers belong in commands, with payload schemas in their own feature validators.
The room wires monster-death handling to rewards so combat does not import party services.
Player schemas delegate stat calculation and persistence mapping to player services;
inventory upgrades and disassembly live in `equipment-upgrade.world.service.ts`.
Colyseus schemas belong to their feature in `modules/<feature>/schemas/`:
player/input/owned skills in players, monsters in monsters, NPCs/interactables in content,
dungeon state in dungeons, and hitboxes/projectiles/areas/auras in combat.
Only the aggregate `WorldState` belongs in the room-level `schemas/` folder.
`scripts/generate-room-schemas.mjs` discovers schemas recursively. Generated Unity schemas stay in `Assets/ERPG/Scripts/Network/Schema`.
Do not manually move or edit generated C# schemas to match feature folders.

C# namespaces stay `ERPG.Rooms.World`; moving scripts must preserve their `.meta` GUIDs.
Update server import paths and client source-reference comments when moving shared logic.

World and party implementations must not import each other's internal files.
World consumes public party DTOs/helpers through `src/rooms/party/party.shared.ts`
and RPC through party's command classes with `callRoom`. Transport lives in `src/core/rooms/room.integration.ts`.
Party discovery/creation belongs to the world
player-party service; dungeon launch coordination lives in `src/rooms/coordinators`.
World-side party actions are player commands. Dungeon admission belongs to the
world dungeon module, and kill rewards/quest application belong to rewards.
Player commands call the typed RPC remotes directly. Shared player lookup,
snapshot mapping/application and RPC capabilities live in
`modules/players/services/player-party.world.service.ts`; there is no separate
world-party integration layer.
Only the party room owns membership, loot mode and the round-robin cursor.

Each command class lives in its own file and owns its action's handling. Inventory
commands share an abstract command for validation, responses and persistence;
their operation runs in the concrete command. Services hold processing reused by
other actions or callers. See [command conventions](../../../docs/room-command-pattern.md).
