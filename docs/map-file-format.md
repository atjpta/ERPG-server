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
- `contentHash` (sha1 của nội dung đã chuẩn hoá) lưu ở `game_maps.content_hash` — client so với hash của file trong build.
- Tên hiển thị không nằm trong file: client tra locale theo `map.{code}.name`.
- `npcs`: `{npcCode, x, y, direction}` — NPC được định nghĩa ở bảng `npcs` (dùng chung nhiều map).
- `interactables`: `portal` / `gather` / `sign`, id ổn định trong map, `code` (tuỳ chọn, `InteractableCode`) là diện mạo để client chọn prefab — chi tiết ở [content-authoring.md](content-authoring.md).
- Portal trỏ tới `targetMapCode` + `targetSpawnId` (id spawn point, không phải toạ độ).
