# Thêm map / NPC / thoại / quest

Mọi nội dung là **data** — thêm mới không sửa code. Server chỉ gửi **code / text key**, client Unity tra locale.

## Text key (client tra bảng locale)

| Loại                    | Key                                                                        |
| ----------------------- | -------------------------------------------------------------------------- |
| Tên map / NPC / vật thể | `map.{code}.name`, `npc.{code}.name`, `interactable.{id}.name`             |
| Quest                   | `quest.{code}.name`, `quest.{code}.desc`, `quest.{code}.obj.{objectiveId}` |
| Thoại                   | `dialogue.{code}.{nodeId}.text`, `dialogue.{code}.{nodeId}.opt.{optionId}` |

Node/option có `textKey` riêng thì dùng key đó. `yarn config:export` xuất `locale-keys.json` (mọi key cần dịch),
`content.json` (NPC, thoại, quest) sang `Assets/ERPG/ServerData` (chỉ Editor dùng, không vào build) và `skills.json` sang `Resources/Config` của Unity.

## Thêm map

1. Khai báo map trong `src/modules/maps/data/definitions/<code>.json` (Map Lab của Unity) (config: loại, level, quái ở marker nào, NPC slot, portal...) → [map-file-format.md](map-file-format.md).
2. `yarn config:export` xuất `map-markers.json`; Unity đặt vị trí các marker đó rồi export `<mapCode>.map.json` (chỉ vị trí) vào `src/modules/maps/data/`.
3. `yarn seed`. Seed dừng nếu portal trỏ tới map/spawn không có, layout có marker lạ, hoặc code NPC/item/monster/thoại sai (`ContentRefsCheck`). Marker chưa có vị trí chỉ cảnh báo.

Định nghĩa map chứa: `spawnPoints` (id + kind), `monsterGroups` (nhóm quái nhiều loại ở 1 marker), `npcs` (slot đặt NPC — 1 NPC đặt ở nhiều map được), `interactables`:

| type     | Trường riêng                     | Tác dụng                                                 |
| -------- | -------------------------------- | -------------------------------------------------------- |
| `portal` | `targetMapCode`, `targetSpawnId` | Chuyển map (server gửi `mapChange`, client vào room mới) |
| `gather` | `reward`, `respawnSec`           | Nhặt, ẩn đi `respawnSec` giây trong kênh                 |
| `sign`   | `dialogueCode`                   | Mở thoại không cần NPC                                   |

Mọi vật thể có `conditions` tuỳ chọn.

## Thêm NPC

Thêm vào `modules/npcs/seeds/npc.seed-data.ts` (hoặc `POST /admin/npcs`), rồi đặt vị trí trong file map.

- `defaultDialogueCode`: thoại mặc định.
- `dialogueRules`: `{ mapCode?, priority, conditions, dialogueCode }` — rule thoả điều kiện có `priority` cao nhất thắng,
  nhờ đó **cùng NPC nói khác nhau theo hoàn cảnh** (quest xong/chưa, level, class, map, flag...).
- `functions`: UI chức năng (`shop`, `storage`, `enhance`, `refine`, `disassemble`, `quest_board`), mở bằng action `open_function`.
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

Client → server: `interact {id}`, `interactNpc {npcCode}`, `dialogueChoose {optionId}` (rỗng = tiếp tục), `dialogueClose`, `questList`, `questPreview {questCode}`, `questAbandon {questCode}`, `dungeonLeave`.
Server → client: `interactResult` (lỗi chuyển map: `level_too_low`, `map_not_open`, `exit_locked`), `dialogue` (kèm `offerQuestCodes`), `dialogueEnd`, `npcFunctionOpen`,
`mapChange {mapCode, spawnId, roomName, instanceId?}` (`roomName = "dungeon"` thì join room `dungeon` với option `{mapCode, instanceId}`), `questList`, `questUpdate`, `questPreview`,
`npcMarkers` (dấu `!`/`?` + `category` + minimap), `questTargets` (chữ Q), `features`, `dungeonChamberClear`, `dungeonClear`; state `dungeon` (HUD chamber/phase/bộ đếm quái).

## Minimap

Server không render ảnh: client dùng sprite theo `map.code`. `GET /user/maps/:code/content` trả layout (collider, spawn, NPC, portal, `contentHash`);
marker NPC theo quest của riêng player đến qua message `npcMarkers`.

## Phía Unity cần làm theo

- Port `applyMove` mới ([movement.step.ts](../src/rooms/world/modules/players/simulation/movement.step.ts)) — va chạm theo `colliders` của map (NPC không chặn) + hình chân `collider` của entity.
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

Mỗi party là một Colyseus room `party` (state Schema: `leaderPlayerId`, `members{playerId, name, level, hp, maxHp, mapCode, inWorld, inDungeon}`). Client giữ **hai kết nối**: world room + party room, và giữ nguyên kết nối party khi đổi map.

- Tạo: `partyCreate` ở world room → server trả `party {roomId}` → client `joinById(roomId)`. Vào dungeon mà chưa có party thì server tự tạo party 1 người.
- Chủ gửi vào party room: `invite {playerName}`, `kick {playerId}`, `promote {playerId}`, `disband`, `setLoot {mode}`; mọi người: `leave`. Người được mời nhận `partyInviteReceived` ở world room: chấp nhận = `joinById(partyRoomId)` trong hạn (`party_config.inviteTtlSec`), từ chối = `partyDecline`.
- Server → party room: `notice {code, playerName?}` (invite_sent, invite_declined, invite_expired, member_joined, member_left, kicked, leader_changed, disbanded và các lỗi `not_leader`, `party_full`, `target_offline`, `target_not_found`, `target_in_party`, `self_target`, `already_member`, `not_member`, `invite_limit`), `dungeonDenied {dungeonCode, failures[{playerId, name, reason}]}`.
- **Rời là rời ngay:** tự rời, bị kick, mất kết nối, thoát game → ra khỏi party (không giữ chỗ, không reconnect); hết người thì room tự đóng; chủ rời thì chủ chuyển cho người vào sớm nhất. Đăng nhập lại thì phải mời lại. Đổi map / vào dungeon **không** rời party.
- **Chia thưởng** (thành viên còn sống **trong cùng room = cùng map** với người hạ quái):
    - **Giới hạn chênh level:** chỉ thành viên có `|level − level quái| ≤ maxLevelGap` được chia (người kết liễu luôn được tính; `maxLevelGap = 0` = không giới hạn). Chỉ còn 1 người đủ điều kiện thì người đó nhận hết.
    - **Exp** chia đều, tổng × (1 + `expBonusPerExtraMember` × (n − 1)). **Vàng** chia đều (phần dư về người kết liễu) nếu `shareGold`.
    - **Item** (cả stack) giao cho một người theo `lootMode` của party: `killer` (người kết liễu giữ hết), `round_robin` (luân phiên, mặc định), `random`. Chủ đổi bằng `setLoot {mode}` ở party room; chế độ hiện tại nằm ở `PartyState.lootMode`.
    - Mọi thành viên còn sống trong room nhận tiến độ quest kill như người kết liễu. Clear dungeon: cả instance nhận event.
- **Vào dungeon:** chỉ chủ bấm cổng; party room kiểm từng người (`level ≥ minLevel`, còn sống, đang trong world, chưa ở dungeon). Có ai không đạt → không ai vào, cả party nhận `dungeonDenied`. Đạt hết → mọi thành viên (ở bất kỳ map nào) nhận `mapChange` vào cùng instance; dungeon chờ đủ người tối đa 15 giây rồi mới bắt đầu để level quái tính trên cả nhóm.
- Config `party_config` (master data): `maxMembers`, `inviteTtlSec`, `expBonusPerExtraMember`, `maxLevelGap`, `shareGold`, `lootMode` (mặc định của party mới).
