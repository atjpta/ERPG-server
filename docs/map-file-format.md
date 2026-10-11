# Map file `<mapCode>.map.json`

Nguồn dữ liệu duy nhất của layout map. Unity export → commit vào `src/modules/maps/data/` → `yarn seed` validate (`MapFileSchema`) rồi upsert vào `game_maps`.

- Toạ độ theo **tile**, gốc trên-trái, y hướng xuống (server). Unity: trừ nửa kích thước map, đảo dấu y.
- Tên file = `code` + `.map.json`.
- `spawnPoints`: id ổn định (không đổi sau khi phát hành). Đúng 1 điểm `kind=default`; `respawn` = chỗ hồi sinh; `arrival` = điểm đến của portal.
- `colliders`: rect `{x,y,w,h}` chặn đường. Server chặn trong `applyMove` bằng `collider` của entity; client phải dùng **cùng** danh sách này để dự đoán.
- `monsterSpawns`: `{monsterCode, count, spawnX, spawnY, type?, rarity?, minLevel?, maxLevel?}`.
    - `type`: `normal` (mặc định) / `elite` / `boss` cố định, hoặc `random` — mỗi lần sinh / hồi sinh server roll normal hoặc elite (xác suất `eliteChance`), và map chỉ có tối đa `maxElitesPerMap` elite sống cùng lúc (vượt thì ra normal). Spawn `elite` / `boss` cố định không bị giới hạn này.
    - `rarity`: bỏ trống (Unity không xuất) = server roll theo trọng số của loại; điền = cố định.
    - Level: mỗi con roll trong `[minLevel, maxLevel]` của spawn, không có thì trong `monsterLevel` của map, không có nữa thì level của monster; exp/tiền rơi đổi theo tỉ lệ level. Hồi sinh roll lại cả loại, độ hiếm, level.
    - Cấu hình roll (`eliteChance`, `maxElitesPerMap`, trọng số độ hiếm theo loại) là master data `monster_spawn_config` — seed mặc định ở `DEFAULT_MONSTER_SPAWN_CONFIG`, admin sửa được qua master data.
- `monsterLevel`: `{min, max}` khoảng level quái của cả map (tuỳ chọn), `yarn seed` điền vào từng spawn chưa có khoảng riêng.
- `minLevel`: level tối thiểu để vào map (mặc định 1) — client hiện "Lv X+"; server chặn ở `transfer` (lỗi `level_too_low`). Map đã khai báo trong `MAP_REGISTRY` (`maps/seeds/map-registry.ts`) nhưng chưa có file thì seed tạo row **placeholder** (`inactive`, `layout_ready = false`, không layout) và server log cảnh báo lúc `yarn dev` cho tới khi file được thêm + `yarn seed`.
- `dungeon` (bắt buộc với `type: "dungeon"`, cấm với loại khác): `{maxLevel, timeLimitSec?, clearReward?, chambers[]}`. Level quái = ceil(trung bình level người trong instance), tối đa `maxLevel`. `chambers` đi tuần tự, mỗi chamber:
    - `bounds {x,y,w,h}`, `entry {x,y}` (chỗ đặt player khi vào chamber), `exit {x,y,radius}` (cổng sang chamber kế; chamber boss có thể không có), `isBoss` (chỉ chamber cuối), `clearReward?`.
    - `phases[]`: `{id, delaySec, monsterSpawns[]}` — phase đầu `delaySec = 0`, các phase sau tăng dần; phase k spawn khi đủ `delaySec` giây kể từ lúc chamber bắt đầu. Phải hạ **hết quái mọi phase** mới mở `exit`. Quái trong dungeon không hồi sinh; `type: "elite"` / `"boss"` đặt trong `monsterSpawns` của phase.
    - Drop quái trong dungeon **không** nằm trong file (đây là config, không phải layout): chỉnh bằng master data `dungeon_drop_config` (seed `DEFAULT_DUNGEON_DROP_CONFIG` hoặc `PUT /admin/master-data/dungeon_drop_config`) theo code map — `expMultiplier` / `goldMultiplier` / `dropRateMultiplier`, `equipmentRate` + `equipmentRarity`, `extraItems` `[{itemCode, min, max, rate, bossOnly?}]`.
    - Cổng exit là interactable động có id `exit_<chamberId>` (không khai trong `interactables`), server khoá tới khi chamber xong.
    - Map `monsterSpawns` / `monsterLevel` ở cấp map không dùng cho dungeon.
    - Vào dungeon: đặt `portal` trong field trỏ tới `targetMapCode` = code dungeon + `targetSpawnId` (id arrival của file dungeon); server lưu chỗ đứng cũ, cấp `instanceId` riêng (`mapChange.roomName = "dungeon"`).
- `contentHash` (sha1 của nội dung đã chuẩn hoá) lưu ở `game_maps.content_hash` — client so với hash của file trong build.
- Tên hiển thị không nằm trong file: client tra locale theo `map.{code}.name`.
- `npcs`: `{npcCode, x, y, direction}` — NPC được định nghĩa ở bảng `npcs` (dùng chung nhiều map).
- `interactables`: `portal` / `gather` / `sign`, id ổn định trong map, `code` (tuỳ chọn, `InteractableCode`) là diện mạo để client chọn prefab — chi tiết ở [content-authoring.md](content-authoring.md).
- Portal trỏ tới `targetMapCode` + `targetSpawnId` (id spawn point, không phải toạ độ).
