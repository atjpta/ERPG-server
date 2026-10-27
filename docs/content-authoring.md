# Thêm map / NPC / thoại / quest

Mọi nội dung là **data** — thêm mới không sửa code. Server chỉ gửi **code / text key**, client Unity tra locale.

## Text key (client tra bảng locale)

| Loại                    | Key                                                                        |
| ----------------------- | -------------------------------------------------------------------------- |
| Tên map / NPC / vật thể | `map.{code}.name`, `npc.{code}.name` (vật thể cũng là NPC)                 |
| Quest                   | `quest.{code}.name`, `quest.{code}.desc`, `quest.{code}.obj.{objectiveId}` |
| Thoại                   | `dialogue.{code}.{nodeId}.text`, `dialogue.{code}.{nodeId}.opt.{optionId}` |

Node/option có `textKey` riêng thì dùng key đó. `yarn config:export` xuất `locale-keys.json` (mọi key cần dịch),
`content.json` (NPC, thoại, quest) sang `Assets/ERPG/ServerData` (chỉ Editor dùng, không vào build) và `skills.json` sang `Resources/Config` của Unity.

## Thêm map

1. Khai báo map trong `src/modules/maps/data/definitions/<code>.json` (Map Lab của Unity) (config: loại, level, quái ở marker nào, NPC slot, portal...) → [map-file-format.md](map-file-format.md).
2. `yarn config:export` xuất `map-markers.json`; Unity đặt vị trí các marker đó rồi export `<mapCode>.map.json` (chỉ vị trí) vào `src/modules/maps/data/`.
3. `yarn seed`. Seed dừng nếu portal trỏ tới map/spawn không có, layout có marker lạ, hoặc code NPC/item/monster/thoại sai (`ContentRefsCheck`). Marker chưa có vị trí chỉ cảnh báo.

Định nghĩa map chứa: `spawnPoints` (id + kind), `monsterGroups` (nhóm quái nhiều loại ở 1 marker), `npcs` (slot đặt NPC **và vật thể** — 1 template đặt ở nhiều map được, slot ghi đè `radius` / `conditions` / `functions`).
Vật thể là NPC `kind = object` (xem [map-file-format.md](map-file-format.md)); hành vi nằm ở `functions`:

| Chức năng  | `config`                         | Tác dụng                                                                                  |
| ---------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| `portal`   | `targetMapCode`, `targetSpawnId` | Chuyển map (server gửi `mapChange`, client vào room mới); đích là dungeon thì vào dungeon |
| `teleport` | `openToAll?`                     | Bệ dịch chuyển nhanh: mở danh sách điểm đến (`teleportList`)                              |
| `gather`   | `reward`, `respawnSec`           | Nhặt, ẩn đi `respawnSec` giây trong kênh                                                  |
| (thoại)    | `defaultDialogueCode` của NPC    | Bảng thông báo: mở thoại không cần chức năng                                              |

## Thêm NPC

Thêm vào `modules/npcs/seeds/npc.seed-data.ts` (hoặc `POST /admin/npcs`), rồi đặt vị trí trong file map.

- `defaultDialogueCode`: thoại mặc định.
- `dialogueRules`: `{ mapCode?, priority, conditions, dialogueCode }` — rule thoả điều kiện có `priority` cao nhất thắng,
  nhờ đó **cùng NPC nói khác nhau theo hoàn cảnh** (quest xong/chưa, level, class, map, flag...).
- `functions`: UI chức năng (`shop`, `storage`, `enhance`, `refine`, `disassemble`, `quest_board`, `crafting`), mở bằng action `open_function`.
- `colliderWidth/Height`: vùng chặn dưới chân NPC (hiện không dùng để chặn đường: người chơi đi xuyên qua NPC).

## Thêm thoại

`modules/dialogues/seeds/dialogue.seed-data.ts` (hoặc `POST /admin/dialogues`). Đồ thị node: bắt buộc có node `start`;
node có `options` (lựa chọn) hoặc `next` ("Tiếp tục"), không có cả hai thì thoại kết thúc ở node đó.
Seed/admin từ chối đồ thị hỏng (next sai, node mồ côi, trùng id).

**Conditions** (`negate: true` để đảo): `level_min`, `level_max`, `class_in`, `quest_state`, `has_item`, `flag`, `map_is`, `currency_min`.

**Actions** (chạy khi vào node / chọn option): `start_quest`, `complete_quest`, `give_item`, `take_item`, `give_currency`,
`take_currency`, `set_flag`, `heal`, `teleport`, `open_function`, `talk`.

Server giữ phiên thoại; client chỉ gửi `optionId` và server **kiểm lại điều kiện + khoảng cách** mỗi lần chọn.

## Thêm quest

`modules/quests/seeds/quest.seed-data.ts` (hoặc `POST /admin/quests`): `giverNpcCode`, `turnInNpcCode`, `requiredLevel`,
`prerequisiteQuestCodes`, `repeat` (`none|daily|infinite`), `objectives` (`kill|collect|talk|interact`), `rewards` (item theo code).

Phân loại: `category` = `hero` (đỏ, cốt truyện, `chapter`, `unlockFeatures`) / `side` (vàng) / `daily` (xanh lá, sinh động).
Mục tiêu `clear_dungeon` (`targetCode` = code map dungeon) tính khi hạ boss chamber cuối. Hoàn thành quest có `unlockFeatures`
thì ghi flag `unlock.<feature>` (dùng điều kiện `flag` trong thoại/portal) và gửi message `features`.

Quest hero/side viết gọn trong `modules/quests/seeds/quest-content.ts` (1 dòng/quest): từ đó sinh quest + 3 thoại
`{code}_offer|progress|done` + rule thoại của NPC (`questDialogueRules(npcCode)`). Chuỗi hero hiện tại:
`adventurer_registration → first_hunt → strange_mana → shadows_of_the_forest → werewolf_den → into_the_evergrowth →
sanctuary_of_life → road_to_the_city`.

**Quest hằng ngày** (`daily_kill`, `daily_dungeon`, `daily_collect`): không nằm trong bảng `quests`. Lần đầu vào room trong ngày
(sau khi mở khoá `daily_quest` bằng quest đăng ký mạo hiểm giả) server xoá bộ cũ và sinh bộ mới theo level hiện tại từ master data
`daily_quest_config` (bậc level, giờ reset, thưởng/level), lưu ở `player_states.daily_quests`. Nhận thưởng tại `guild_officer`
(thoại `daily_claim`).

Nhận/trả quest không có code riêng: viết dialogue có action `start_quest` / `complete_quest` và rule ở NPC
(thứ tự ưu tiên thường là: trả > đang làm > nhận). Tiến độ lưu ở `player_states.quests` cùng checkpoint với túi đồ;
trả quest cần còn chỗ túi cho thưởng (không thì báo lỗi, quest giữ nguyên).

## Message realtime (room `world`)

**Party** (room riêng `party`, mỗi party một room): xem mục "Party" dưới. Thêm vào room `world`: client → `partyCreate`, `partyDecline {partyRoomId}`; server → `party {roomId}`, `partyInviteReceived {partyRoomId, fromName, expiresInSec}`; lỗi `interactResult` khi vào dungeon: `party_not_leader`, `party_denied`.

Client → server: `interactNpc {id}` (id slot NPC / vật thể trong map), `dialogueChoose {optionId}` (rỗng = tiếp tục), `dialogueClose`, `questList`, `questPreview {questCode}`, `questAbandon {questCode}`, `dungeonLeave`.
Server → client: `interactResult` (response của `interactNpc` / `teleportTo`; lỗi chuyển map: `level_too_low`, `map_not_open`, `exit_locked`), `dialogue` (kèm `offerQuestCodes`), `dialogueEnd`, `npcFunctionOpen`,
`mapChange {mapCode, spawnId, roomName, instanceId?}` (`roomName = "dungeon"` thì join room `dungeon` với option `{mapCode, instanceId}`), `questList`, `questUpdate`, `questPreview`,
`npcMarkers` (dấu `!`/`?` + `category` + minimap), `questTargets` (chữ Q), `features`, `dungeonChamberClear`, `dungeonClear`; state `dungeon` (HUD chamber/phase/bộ đếm quái).

## Chức năng của NPC cần đứng gần

`npcFunctionOpen` (action `open_function`) không chỉ báo client mở màn hình: world room ghi lại player đang mở chức năng nào ở NPC nào (`room.npcFunctions`, kèm vị trí + bán kính của NPC).
Các lệnh làm việc của chức năng chạy ở global room (`enhanceEquipment`, `refineEquipment`, `disassembleItems`) hỏi world room qua `rooms/bus` (rpc `checkNpcFunction`) trước khi chạy:

- chưa mở chức năng đúng loại (hoặc chưa ở world room nào) → `NPC_FUNCTION_NOT_OPEN`;
- đã bước ra khỏi tầm (bán kính tương tác + 0.5 tile) → `TOO_FAR`, chức năng đóng; tick cũng đóng chức năng của người đã đi xa / rời room.

Quy tắc chung: mọi tương tác với NPC đều phải kiểm tra tầm đứng. Phần chạy trong world đã được chặn sẵn: `interactNpc` kiểm `interactRadius`, `dialogueChoose` kiểm lại mỗi lần chọn
(`DialogueSessionState.isNear`) nên mọi action của thoại (`start_quest`, `complete_quest`, `give_item`...) chỉ chạy khi còn đứng gần. Chức năng NPC xử lý ngay trong world room (shop, storage, quest_board sau này) gọi thẳng
`room.npcFunctions.check(playerId, type, room.state.players)`; chỉ chức năng xử lý ở global room mới đi qua rpc `checkNpcFunction` (cùng hàm `check` đó).

**Chức năng chạy ở world hay global?** Chạy ở nơi giữ dữ liệu nó cần ghi. World giữ vị trí / map / state room; global giữ ví + túi (`transact` = một transaction DB; bản sao ở world chỉ `credit` / `debit` / `applyOps`, không rollback chung).

| Chức năng                                      | Chạy ở | Lý do                                                                                            |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| `portal`, `teleport`, `gather`, thoại          | World  | cần map, vị trí, `mapChange`, state room (`active`, hồi lại)                                     |
| `quest_board`                                  | World  | nhật ký quest do world giữ; chỉ mở danh sách                                                     |
| `enhance`, `refine`, `disassemble`, `crafting` | Global | trừ tiền + nguyên liệu + đổi túi phải cùng một transaction; world hỏi qua rpc `checkNpcFunction` |
| `shop`, `storage` (chưa có logic)              | Global | mua / cất là nhiều bước nguyên tử (hết chỗ túi thì không trừ tiền) → cần `transact`              |

## Chế tạo (crafting)

NPC chế tạo có chức năng `crafting` với `config: { recipeGroups: ["smithing", ...] }` (code nhóm). Mở bằng thoại như mọi chức năng UI (`open_function` với id chức năng, vd `craft`); world ghi phiên **kèm config**, lệnh `craft { recipeCode, quantity? }` ở global
hỏi lại qua rpc `checkNpcFunction` (nhận về `config`) nên chỉ chế được công thức thuộc nhóm của NPC đang mở và còn đứng gần.

Dữ liệu (bảng có tiền tố `crafting_`): `crafting_recipe_groups` (`code`, `sortOrder`) và `crafting_recipes` — seed ở `src/modules/crafting/seeds/` (`recipe-group.seed-data.ts`, `recipe.seed-data.ts`):

| Trường                                       | Ý nghĩa                                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `groupCodes`                                 | Nhóm chứa công thức (một công thức thuộc nhiều nhóm được)                                                        |
| `resultItemCode`, `resultQuantity`           | Item tạo ra; số lượng chỉ cho item xếp chồng                                                                     |
| `resultMetadata`                             | Trang bị **chỉ số cố định** (`level`, `rarity`, `mainStats`, `subStats`, `rarityStats`), mỗi lần chế một bản sao |
| `resultLevel` + `resultRarity`               | Trang bị không có `resultMetadata`: roll ngẫu nhiên như rơi đồ (loại trừ nhau với `resultMetadata`)              |
| `ingredients[{ itemCode, quantity, order }]` | Nguyên liệu xếp chồng (không dùng trang bị); `order` là thứ tự hiển thị, không trùng trong một công thức         |
| `cost[{ code, amount }]`, `requiredLevel`    | Tiền (nhiều loại) và level tối thiểu                                                                             |

Chế `quantity` lần thì nguyên liệu và tiền nhân `quantity` (tối đa `crafting_config.maxQuantity`); trang bị ra `quantity` món riêng. Lỗi nào cũng không đổi gì (`ITEM_NOT_ENOUGH`, `CURRENCY_NOT_ENOUGH`, `INVENTORY_FULL`, `LEVEL_TOO_LOW`, `RECIPE_NOT_FOUND`,
`RECIPE_NOT_AVAILABLE`, `CRAFT_QUANTITY_TOO_HIGH`). `ContentRefsCheck` bắt nhóm / item sai, nguyên liệu là trang bị, `resultMetadata` cho item không phải trang bị, trang bị thiếu cả metadata lẫn `resultLevel`/`resultRarity`.
Locale key: `recipe.{code}.name`, `recipe_group.{code}.name`.

**Thêm công thức:** thêm code vào `RecipeCode` (và `RecipeGroupCode` nếu nhóm mới), khai trong seed data, gắn nhóm vào `config.recipeGroups` của NPC, `yarn codes:generate`, `yarn seed`.

Lệnh xem trước (`previewUpgrade`, `previewDisassemble`) chỉ đọc nên không bị chặn. Thêm chức năng NPC mới (shop, storage, quest_board): lệnh của nó gọi `npcFunctionGlobalService.require(player, NpcFunctionType.X)` trước khi làm việc
(với lệnh túi đồ, `UpgradeGlobalCommand` đã làm sẵn qua `functionType`).

## Minimap

Server không render ảnh: client dùng sprite theo `map.code`. `GET /user/maps/:code/content` trả layout (collider, spawn, NPC, portal, `contentHash`);
marker NPC theo quest của riêng player đến qua message `npcMarkers`.

## Phía Unity cần làm theo

- Port `applyMove` mới ([movement.step.ts](../src/modules/player/simulation/movement.step.ts)) — va chạm theo `colliders` của map (NPC không chặn) + hình chân `collider` của entity.
- Khớp `contentHash` của `.map.json` trong build với hash server trả.
- UI thoại / quest / marker; bảng locale theo `locale-keys.json`.

## Dựng map trong Unity (Greenfield Village = `greenfield_village`)

Art lấy từ `Textures/MapWorld/Environment`. Công cụ ở menu `Tools/ERPG/Greenfield/`:

1. **Cut Sprites** — cắt các mảnh từ Environment thành sprite riêng trong `Textures/MapWorld/Greenfield` (cây, bụi, đá, đồ vật), ghép **nhà** từ bộ mái + tường + cửa + cửa sổ, và sinh tile nền (cỏ, đất, đá lát) theo bảng màu của pack. Danh sách ô cắt nằm ở `GreenfieldCatalog.cs`.
2. **Make Prefabs** — tạo prefab trong `Prefabs/Environment/{Buildings,Nature,Props}`: gốc ở chân, sprite sắp theo y cùng nhân vật, kèm collider marker nếu vật đó chặn đường.
3. **Build Greenfield Village** — dựng lại làng trong scene `World` bằng các prefab đó + marker spawn / NPC / vật thể. Bố cục sửa trong `GreenfieldVillageBuilder.cs`.
4. **Export Map** (`Tools/ERPG/Export Map`) — xuất marker thành `greenfield_village.map.json` vào `src/modules/maps/data`, rồi `yarn seed`.

Mọi object art nằm ở layer `MapArt`; minimap chụp đúng layer đó (một camera tạm render cả map ra texture) nên hiển thị y hệt map thật.

### Kiểm tra collider trên client trước khi đồng bộ lên server

- `Tools/ERPG/Check Map Collision`: đi thử một "chân người chơi" trên toàn map đúng như bước di chuyển chặn, báo NPC / portal / điểm spawn nào **không tới được** từ điểm spawn mặc định hoặc đang kẹt trong tường.
- `Export Map` chạy kiểm tra này trước và **từ chối xuất** nếu có lỗi — chỉ khi client ổn mới ghi `greenfield_village.map.json` cho server.
- Khi chơi trong Editor, nhấn **F12** để vẽ viền đỏ các khối chặn (collider map) lên map, đối chiếu bằng mắt với hình.

## Party

Party là logic trong `global` room (một room / game server, xem `src/rooms/global/README.md`), không còn Colyseus room riêng và không sync Schema state cho client (global không có state Schema): client nhận snapshot `PartyStateMessage` (`leaderPlayerId`, `lootMode`, `members{playerId, name}`) qua push `partyState`. Global chỉ giữ danh sách thành viên, chủ và cách chia loot; **level, HP, vị trí của thành viên cùng map đọc từ state world**: `PlayerWorldState.partyId` (đồng bộ cho mọi client trong room) khớp với `partyId` của `partyState`, rồi tra `players[playerId]` lấy `level/hp/maxHp/name...`; thành viên ở map khác chỉ hiện tên. Client giữ **hai kết nối**: world room + global room, và giữ nguyên kết nối global khi đổi map. Mọi thao tác party là Request/Response (`room.Request<T>`) gửi lên global room.

- Tạo: request `partyCreate` ở global room → response là `PartyStateMessage`. Vào dungeon mà chưa có party thì server tự tạo party 1 người.
- Chủ gửi request lên global room: `partyInvite {playerName}`, `partyKick {playerId}`, `partyPromote {playerId}`, `partyDisband`, `partySetLoot {mode}`; mọi người: `partyLeave`, `partyRequestJoin {playerId}`. Người được mời nhận push `partyInviteReceived`: chấp nhận = request `partyAcceptInvite {partyId}` trong hạn (`party_config.inviteTtlSec`), từ chối = `partyDecline {partyId}`.
- Server → client: push `partyNotice {notice, playerName?}` (invite_sent, invite_declined, invite_expired, member_joined, member_left, kicked, leader_changed, disbanded, join_request_sent), `partyState`, `partyLeft`, `partyJoinRequest`, `partyDungeonDenied` (`Result` thất bại `DUNGEON_DENIED`, `error` là `{dungeonCode, failures[{playerId, name, reason}]}`). Lỗi thao tác (`PARTY_NOT_LEADER`, `PARTY_FULL`, `PARTY_TARGET_NOT_FOUND`...) là `Result` thất bại trong response của request, không còn là notice.
- **Thành viên đến khi rời:** tự rời, bị kick, kết nối global kết thúc (thoát game, hết thời gian giữ chỗ reconnect) hoặc rời hẳn world room (thoát / mất kết nối world sau thời gian giữ chỗ) → ra khỏi party; hết người thì party tan; chủ rời thì chủ chuyển cho người vào sớm nhất. Đăng nhập lại thì phải mời lại. Đổi map / vào-ra dungeon **không** rời party (world báo `changingMap` khi bước vào portal). Lưới an toàn: không có vị trí world quá 120 giây thì cũng ra khỏi party.
- **Chia thưởng** (thành viên còn sống **trong cùng room = cùng map** với người hạ quái):
    - **Giới hạn chênh level:** chỉ thành viên có `|level − level quái| ≤ maxLevelGap` được chia (người kết liễu luôn được tính; `maxLevelGap = 0` = không giới hạn). Chỉ còn 1 người đủ điều kiện thì người đó nhận hết.
    - **Exp** chia đều, tổng × (1 + `expBonusPerExtraMember` × (n − 1)). **Vàng** chia đều (phần dư về người kết liễu) nếu `shareGold`.
    - **Item** (cả stack) giao cho một người theo `lootMode` của party: `killer` (người kết liễu giữ hết), `round_robin` (luân phiên, mặc định), `random`. Chủ đổi bằng request `partySetLoot {mode}` ở global room; chế độ hiện tại nằm ở `PartyState.lootMode`.
    - Mọi thành viên còn sống trong room nhận tiến độ quest kill như người kết liễu. Clear dungeon: cả instance nhận event.
- **Vào dungeon:** chỉ chủ bấm cổng; global room kiểm từng người (`level ≥ minLevel`, còn sống, đang trong world, chưa ở dungeon). Có ai không đạt → không ai vào, cả party nhận `partyDungeonDenied`. Đạt hết → mọi thành viên (ở bất kỳ map nào) nhận `mapChange` vào cùng instance; dungeon chờ đủ người tối đa 15 giây rồi mới bắt đầu để level quái tính trên cả nhóm.
- Config `party_config` (master data): `maxMembers`, `inviteTtlSec`, `expBonusPerExtraMember`, `maxLevelGap`, `shareGold`, `lootMode` (mặc định của party mới).
