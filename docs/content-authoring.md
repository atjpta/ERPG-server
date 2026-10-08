# Thêm map / NPC / thoại / quest

Mọi nội dung là **data** — thêm mới không sửa code. Server chỉ gửi **code / text key**, client Unity tra locale.

## Text key (client tra bảng locale)

| Loại                    | Key                                                                        |
| ----------------------- | -------------------------------------------------------------------------- |
| Tên map / NPC / vật thể | `map.{code}.name`, `npc.{code}.name`, `interactable.{id}.name`             |
| Quest                   | `quest.{code}.name`, `quest.{code}.desc`, `quest.{code}.obj.{objectiveId}` |
| Thoại                   | `dialogue.{code}.{nodeId}.text`, `dialogue.{code}.{nodeId}.opt.{optionId}` |

Node/option có `textKey` riêng thì dùng key đó. `yarn config:export` xuất `locale-keys.json` (mọi key cần dịch),
`content.json` (NPC, thoại, quest) và `skills.json` sang `Resources/Config` của Unity.

## Thêm map

1. Đặt marker trong Unity, export `<mapCode>.map.json` → [map-file-format.md](map-file-format.md), bỏ vào `src/modules/maps/data/`.
2. `yarn seed`. Seed dừng nếu portal trỏ tới map/spawn không có, hoặc code NPC/item/monster/thoại sai (`ContentRefsCheck`).

File map chứa: `spawnPoints`, `colliders`, `monsterSpawns`, `npcs` (đặt NPC — 1 NPC đặt ở nhiều map được), `interactables`:

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

Nhận/trả quest không có code riêng: viết dialogue có action `start_quest` / `complete_quest` và rule ở NPC
(thứ tự ưu tiên thường là: trả > đang làm > nhận). Tiến độ lưu ở `player_states.quests` cùng checkpoint với túi đồ;
trả quest cần còn chỗ túi cho thưởng (không thì báo lỗi, quest giữ nguyên).

## Message realtime (room `world`)

Client → server: `interact {id}`, `interactNpc {npcCode}`, `dialogueChoose {optionId}` (rỗng = tiếp tục), `dialogueClose`, `questList`, `questAbandon {questCode}`.
Server → client: `interactResult`, `dialogue`, `dialogueEnd`, `npcFunctionOpen`, `mapChange`, `questList`, `questUpdate`, `npcMarkers` (dấu `!`/`?` + minimap).

## Minimap

Server không render ảnh: client dùng sprite theo `map.code`. `GET /maps/:code/content` trả layout (collider, spawn, NPC, portal, `contentHash`);
marker NPC theo quest của riêng player đến qua message `npcMarkers`.

## Phía Unity cần làm theo

- Port `applyMove` mới ([movement.step.ts](../src/rooms/world/simulation/movement.step.ts)) — va chạm theo `colliders` của map (NPC không chặn) + hình chân `collider` của entity.
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
