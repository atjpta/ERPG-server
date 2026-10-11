# TODO phía Unity client

Server đã xong phần dưới; client chưa làm gì trong file này. Mỗi mục ghi **dữ liệu/message server cung cấp** và **việc client phải làm**.
Sau khi pull server: `yarn schema:generate` (C# schema/message mới), `yarn config:export` (content.json, locale-keys.json, monster/class/interactable codes).

## 0. Việc chung đầu tiên

- [ ] Chạy `yarn schema:generate` rồi sửa lỗi compile do đổi tên/thêm kiểu:
    - `Biome`: chỉ còn `starter | slime | werewolf | werebear` (bỏ `orc`, `skeleton`, `shapeshifter`).
    - `NpcMarker` thêm `talkTarget`; `QuestObjectiveType` thêm `clear_dungeon`; `QuestCategory` mới (`hero | side | daily`).
    - `MapChangeMessage` thêm `roomName` (`WorldRoomName`) và `instanceId`.
    - `QuestMessage` thêm `category`, `requiredLevel`, `giverNpcCode`, `turnInNpcCode`, `rewards`.
    - `DialogueMessage` thêm `offerQuestCodes`.
    - `WorldState.dungeon` (`DungeonWorldState`) chỉ có ở room dungeon.
- [ ] Đăng ký handler cho message mới: `features`, `questTargets`, `questPreview`, `dungeonChamberClear`, `dungeonClear`.
- [ ] Locale: thêm bản dịch cho mọi key mới trong `locale-keys.json` (map mới, NPC `researcher` `alchemist` `cleric_trainer`, quest hero/side/daily, thoại `*_offer|progress|done`, `daily_claim`). `cleric_sister` đã **đổi tên** thành `cleric_trainer` (đổi prefab/Mapping NPC).
- [ ] Xoá/ngừng dùng prefab, icon, locale của quái `orc`, `skeleton`, `lancer`… (server đã bỏ). Quái còn lại: `slime`, `bat`, `werewolf`, `werebear`.

## 1. Bản đồ & level hiển thị

Server: `GET /maps` và `GET /maps/:code/content` trả `minLevel` (chỉ map `active`; map placeholder chưa có file Unity là `inactive` nên không trả).

- [ ] Hiển thị **"Lv X+"** theo `minLevel` ở: tên map khi vào, loading, cổng/portal (tooltip khi đứng gần), world map/minimap header.
    - Greenfield Village (town, không level) · Greenfield Plains **Lv1+** · Whispering Forest **Lv10+** · Deep Evergrowth **Lv20+**. Dungeon: Slime Hollow Lv1+ (cap quái 10), Werewolf Den Lv10+ (cap 20), Sanctuary of Life Lv20+ (cap 30).
- [ ] Xử lý `interactResult.error` khi bước vào portal: `level_too_low` ("Cần đạt Lv X"), `map_not_open` ("Khu vực chưa mở"), `exit_locked` ("Dọn hết quái để mở cổng").
- [ ] **Dựng 6 map mới trong Unity và export `.map.json`** (Tools/ERPG/Export Map) vào `src/modules/maps/data/`, rồi `yarn seed`. Server log cảnh báo `chưa có data Unity` cho tới khi đủ file:
    - `greenfield_plains` (đã có, từ `greenfield_farmlands` đổi tên), `whispering_forest`, `deep_evergrowth`, `slime_hollow`, `werewolf_den`, `sanctuary_of_life`.
    - Spawn id bắt buộc (portal server đã trỏ vào): village `from_field` (đã có); plains `from_village`; forest `from_village` + `from_evergrowth`; evergrowth `from_forest`; slime_hollow `from_plains`; werewolf_den `from_forest`; sanctuary_of_life `from_evergrowth`. Mọi map field cần thêm `default` + `respawn`.
    - **Flow portal**: village `east_gate` → `whispering_forest/from_village` (đã khai trong file village, đã bỏ biển "cổng khoá"); forest cổng phải → `deep_evergrowth/from_forest`; forest cổng trái → `greenfield_village/from_field`; evergrowth cổng trái → `whispering_forest/from_evergrowth`; plains `to_village` (đã có).
    - **Cổng dungeon** (portal trong field): plains → `slime_hollow/from_plains`; forest → `werewolf_den/from_forest`; evergrowth → `sanctuary_of_life/from_evergrowth`.
    - `monsterLevel` mỗi field: plains 1–5 (slime, bat), forest 10–19 (bat, werewolf), evergrowth 20–29 (werewolf, werebear).
- [ ] Đặt lại vị trí NPC `researcher` (12.0, 4.9) và `alchemist` (29.9, 4.8) trong village cho đúng bố cục nhà (server tạm đặt vào chỗ trống, không trùng collider).
- [ ] Minimap: ảnh theo `map.code` cho 6 map mới (quy trình chụp layer `MapArt` như village).

## 2. Dungeon

Server: join room `dungeon` (khác `world`), instance riêng mỗi lượt; chi tiết file ở `docs/map-file-format.md`.

- [ ] Khi nhận `mapChange`:
    - `roomName = "world"` → `joinOrCreate("world", { mapCode })` như cũ.
    - `roomName = "dungeon"` → `joinOrCreate("dungeon", { mapCode, instanceId })` (dùng đúng `instanceId` server cấp; **không tự sinh**).
- [ ] Dựng dungeon trong Unity: mỗi dungeon nhiều **chamber** nối tuần tự; export marker: `bounds`, `entry`, `exit` (cổng sang chamber kế), `phases` (đặt `monsterSpawns` theo phase + `delaySec`), chamber cuối `isBoss` (boss + tinh anh), `clearReward`, `timeLimitSec?`, `maxLevel`. Cập nhật tool Export Map để xuất khối `dungeon`.
- [ ] Interactable exit có id `exit_<chamberId>` (server tự tạo state, `active = false` khi khoá): vẽ cổng khoá/mở theo `InteractableWorldState.active`, dùng message `interact {id}` để đi qua. Cần prefab cổng (code `portal` có sẵn).
- [ ] Collider/tường ngăn giữa các chamber trong `colliders` (server chỉ khoá bằng cổng exit, không chặn bằng vị trí).
- [ ] **HUD dungeon** từ `state.dungeon`: chamber `chamberIndex+1/chamberCount`, phase `phaseIndex/phaseCount`, **"Còn X quái"** (`remaining`, `total`), đếm ngược phase kế (`nextPhaseInSec`, ẩn khi 0), thời gian còn lại (`timeLeftSec`, 0 = không giới hạn), level quái (`monsterLevel`), cổng mở (`exitOpen`).
- [ ] Message `dungeonChamberClear` (banner "Phòng hoàn thành", cổng sáng lên) và `dungeonClear {leaveInSec}` (màn hình clear + đếm ngược tự thoát).
- [ ] Nút **Rời dungeon** → gửi `dungeonLeave`; sau `mapChange` về field đúng chỗ đứng trước khi vào.
- [ ] Chết trong dungeon: server đưa về **làng gần nhất đã đến** (qua `mapChange`), không hồi sinh tại chỗ — hiện màn hình chết rồi chuyển map.
- [ ] Quái dungeon không hồi sinh; xác quái bị server xoá khi sang chamber mới (xử lý remove monster khỏi state).

## 3. Quest

### 3.1 Loại quest & màu

- [ ] `QuestMessage.category`: **hero = đỏ**, **side = vàng**, **daily = xanh lá**. Dùng cho tab/nhóm trong UI quest, màu dấu NPC, viền quest tracker.
- [ ] Danh sách quest nhóm theo category; hero sắp theo `chapter` (content.json có `sortOrder`, `chapter`, `unlockFeatures`).

### 3.2 Dấu `!` / `?` trên NPC & minimap (message `npcMarkers`)

| `marker`     | Biểu tượng | Màu                                                     |
| ------------ | ---------- | ------------------------------------------------------- |
| `available`  | `!`        | theo `category` (đỏ/vàng/xanh lá) — quest **chưa nhận** |
| `talkTarget` | `!`        | **xám** — NPC là đích nói chuyện của quest đang làm     |
| `inProgress` | `?`        | **xám** — đã nhận, chưa xong, trả tại NPC này           |
| `ready`      | `?`        | theo `category` — **hoàn thành**, đến trả               |
| `none`       | không hiện |                                                         |

- [ ] Vẽ icon trên đầu NPC (sprite `!`/`?`, tint theo bảng). Cập nhật mỗi lần nhận `npcMarkers` (server gửi khi vào room, nhận/trả/bỏ quest, tiến độ đổi).
- [ ] Hiện cùng icon trên **minimap** tại vị trí NPC (lấy từ `/maps/:code/content` hoặc `state.npcs`).

### 3.3 Chữ Q đánh dấu mục tiêu (message `questTargets`)

- [ ] `monsterCodes`: chữ **Q bên trái tên quái** (so `MonsterWorldState.code`).
- [ ] `itemCodes`: chữ **Q góc trên bên phải ô item** trong túi (và item rơi dưới đất nếu có) — giữ tới khi trả quest.
- [ ] `interactableIds` (vật thể thu thập/biển báo), `npcCodes`, `dungeonMapCodes` (đánh dấu cổng/dungeon tương ứng): dùng để highlight/minimap.
- [ ] Xoá Q ngay khi nhận `questTargets` mới (server tính lại sau mỗi tiến độ).

### 3.4 Xem trước phần thưởng

- [ ] Thoại nhận quest: `DialogueMessage.offerQuestCodes` → gửi `questPreview {questCode}` → nhận `questPreview {quest}` → hiện bảng mục tiêu + **phần thưởng** (`rewards`: exp, tiền, item theo `itemCode`) cạnh nút Nhận.
- [ ] UI quest/bảng nhiệm vụ cũng hiện `rewards` (có sẵn trong mọi `QuestMessage`).

### 3.5 Hero quest (đỏ) & mở khoá chức năng

- [ ] Message `features {features[]}` (lúc vào room và khi mở thêm): bật/tắt menu theo mã `guild`, `quest_board`, `daily_quest`, `dungeon`, `alchemy`, `next_phase`.
- [ ] Chuỗi 8 quest: Adventurer Registration (→ guild, quest board, daily) → First Hunt (→ dungeon) → Strange Mana (→ alchemy) → Shadows of the Forest → Werewolf Den (clear dungeon 02) → Into the Evergrowth → Sanctuary of Life (clear dungeon 03) → Road to the City (→ next_phase). Cần locale `quest.<code>.name|desc|obj.<id>` + thoại.
- [ ] Mục tiêu `clear_dungeon`: text mục tiêu + chỉ hướng tới cổng dungeon (`questTargets.dungeonMapCodes`).

### 3.6 Daily quest (xanh lá)

- [ ] Server tự giao 3 quest (`daily_kill`, `daily_dungeon`, `daily_collect`) khi vào game lần đầu trong ngày, sau khi mở `daily_quest`. Chúng xuất hiện trong `questList` như quest đang làm; **không bỏ được**.
- [ ] Nhận thưởng: nói chuyện với `guild_officer` khi có quest xong → thoại `daily_claim` (option `claim_kill|claim_dungeon|claim_collect`).
- [ ] Locale cố định: `quest.daily_kill|daily_dungeon|daily_collect.name|desc` và `.obj.kill|dungeon|collect`; mục tiêu/số lượng lấy từ `QuestMessage.objectives` (targetCode không có trong message — hiện text chung + tiến độ; nếu cần tên quái/item cụ thể thì báo server thêm field).
- [ ] Đếm ngược reset hằng ngày (giờ reset trong master data `daily_quest_config`, mặc định 0h) — nếu muốn hiển thị cần server thêm message.

### 3.7 Side quest (vàng)

- [ ] Hiện nhóm "Nhiệm vụ phụ". Nội dung thiết kế sau; hiện có mẫu `rowan_crops` (farmer_rowan).

## 4. NPC & chức năng

- [ ] Danh sách NPC thật: Village Chief (hero), Guild Officer (hero + bảng daily), Swordsman/Archer/Cleric Trainer (kỹ năng — server chưa có chức năng riêng), Priestess (hồi sinh/nhà thờ), Blacksmith (cường hoá), Alchemist (tinh hoá, mở khoá bởi `alchemy`), Merchant (shop), Hunter Garrick (quest rừng), Researcher (mana + phụ). Đã có thêm Innkeeper, Farmer Rowan, Herbalist, Guard Captain (giữ nguyên).
- [ ] Prefab/animation cho `researcher`, `alchemist`; đổi `cleric_sister` → `cleric_trainer`.
- [ ] Blacksmith **không còn** tinh hoá (chuyển sang Alchemist): UI `npcFunctionOpen` loại `refine` giờ đến từ `alchemist`.
- [ ] `quest_board` (Guild Officer): UI hiện quest daily + hero đang có (dữ liệu từ `questList`), không có message riêng.

## 5. Trang bị & quái mới

- [ ] 3 set trang bị theo biome: **slime lv10**, **werewolf lv20**, **werebear lv30** (mỗi biome 12 loại × 3 class). Tên item `"{Slime|Werewolf|Werebear} …"`, code `equipmentItemCode(biome, class, type)`. Cần icon + sprite trang bị cho từng bộ; bỏ icon orc/skeleton/shapeshifter.
- [ ] Hiển thị set bonus 2/4/6 món theo biome (chỉ số có sẵn, không có tốc độ đánh).
- [ ] Quái: `bat` thuộc set slime; `werewolf` set werewolf; `werebear` set werebear. Tinh anh/boss là `monsterType` (elite/boss) của spawn, dùng scale/size đã có.

## 6. Kiểm thử cuối

- [ ] Reset DB dev rồi `yarn db:migrate && yarn seed` (migration đã gộp thành 1 file `0000_*.sql`), đăng nhập, đi village → plains → village → forest (cần Lv10) → evergrowth (cần Lv20).
- [ ] Làm hết chuỗi hero, kiểm tra màu dấu, Q, preview thưởng, mở khoá chức năng.
- [ ] Vào từng dungeon: phase spawn theo giây, bộ đếm quái, cổng khoá/mở, boss, clear, thoát về đúng chỗ cũ; chết → về làng.
- [ ] Đăng nhập 2 ngày liên tiếp (đổi giờ máy/server) → 3 daily mới theo level.
