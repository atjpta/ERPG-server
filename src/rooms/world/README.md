# World folder map

Both projects group World code by feature. Server folders use lowercase; Unity folders use PascalCase.

| Server: `src/rooms/world` | Unity: `Assets/ERPG/Scripts/Rooms/World` | Responsibility                                                          |
| ------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| `core/`                   | `Core/`                                  | Room lifecycle, shared chain, tick and world helpers                    |
| `players/`                | `Players/`                               | Player state processing, movement; client input and prediction          |
| `monsters/`               | `Monsters/`                              | Monster chains and services; client monster prefabs                     |
| `combat/`                 | `Combat/`                                | Skills, attacks, hitboxes, configuration; client skill effects          |
| `maps/`                   | `Maps/`                                  | Map transfers; client map data, collision, validation and prefabs       |
| `content/`                | `Content/`                               | NPCs, interactions, dialogue, quests and world props                    |
| `dungeons/`               | `Dungeons/`                              | Dungeon sessions, rewards and client gates                              |
| `rewards/`                | `Rewards/`                               | Reward delivery and client reward messages/popups                       |
| `inventory/`              | —                                        | Server inventory commands and validation                                |
| `party/`                  | —                                        | Server party commands and service                                       |
| —                         | `Presentation/`                          | Shared client character views, cameras, prefab infrastructure and debug |

Within a feature, use `chains/Chains`, `commands/Commands`, `services/Services`,
`utils/Utils`, `validators/Validators` and `simulation/Simulation` according to role.
Client-only folders such as `Input`, `Views`, `Models` and `Messages` belong inside their feature.
Create folders only when they contain code; the two runtimes do not need placeholder files.

## Counterparts

| Server file                                     | Unity file                                   |
| ----------------------------------------------- | -------------------------------------------- |
| `core/chains/world.chain.ts`                    | `Core/Chains/WorldChain.cs`                  |
| `core/commands/on-join.world.command.ts`        | `Core/Commands/OnJoinWorldCommand.cs`        |
| `core/commands/on-leave.world.command.ts`       | `Core/Commands/OnLeaveWorldCommand.cs`       |
| `core/services/world.service.ts`                | `Core/Services/WorldService.cs`              |
| `players/chains/player.world.chain.ts`          | `Players/Chains/PlayerWorldChain.cs`         |
| `players/services/player.world.service.ts`      | `Players/Services/PlayerWorldService.cs`     |
| `players/simulation/movement.step.ts`           | `Players/Simulation/WorldMovementStep.cs`    |
| `monsters/chains/monster.world.chain.ts`        | `Monsters/Chains/MonsterWorldChain.cs`       |
| `monsters/services/monster.world.service.ts`    | `Monsters/Services/MonsterWorldService.cs`   |
| `combat/utils/skill-attack.world.util.ts`       | `Combat/Utils/SkillAttackWorldUtil.cs`       |
| `combat/utils/skill-hitbox.world.util.ts`       | `Combat/Utils/SkillHitboxWorldUtil.cs`       |
| `combat/services/skill-config.world.service.ts` | `Combat/Services/WorldSkillConfigRequest.cs` |
| `core/utils/tick.world.util.ts`                 | `Core/Utils/TickWorldUtil.cs`                |
| `core/utils/world.util.ts`                      | `Core/Utils/WorldUtil.cs`                    |

Room entry points and shared message contracts stay at the World root.
Server `schema/` stays in place because `scripts/generate-room-schemas.mjs` discovers
room schemas there. Generated Unity schemas stay in `Assets/ERPG/Scripts/Schema`.
Do not manually move or edit generated C# schemas to match feature folders.

C# namespaces stay `ERPG.Rooms.World`; moving scripts must preserve their `.meta` GUIDs.
Update server import paths and client source-reference comments when moving shared logic.
