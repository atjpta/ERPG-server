# Map file `<mapCode>.map.json`

Nguồn dữ liệu duy nhất của layout map. Unity export → commit vào `src/modules/maps/data/` → `yarn seed` validate (`MapFileSchema`) rồi upsert vào `game_maps`.

- Toạ độ theo **tile**, gốc trên-trái, y hướng xuống (server). Unity: trừ nửa kích thước map, đảo dấu y.
- Tên file = `code` + `.map.json`.
- `spawnPoints`: id ổn định (không đổi sau khi phát hành). Đúng 1 điểm `kind=default`; `respawn` = chỗ hồi sinh; `arrival` = điểm đến của portal.
- `colliders`: rect `{x,y,w,h}` chặn đường. Server chặn trong `applyMove` bằng `collider` của entity; client phải dùng **cùng** danh sách này để dự đoán.
- `monsterSpawns`: `{monsterCode, count, spawnX, spawnY, type?, rarity?}`.
- `contentHash` (sha1 của nội dung đã chuẩn hoá) lưu ở `game_maps.content_hash` — client so với hash của file trong build.
- Tên hiển thị không nằm trong file: client tra locale theo `map.{code}.name`.
- `npcs`: `{npcCode, x, y, direction}` — NPC được định nghĩa ở bảng `npcs` (dùng chung nhiều map).
- `interactables`: `portal` / `gather` / `sign`, id ổn định trong map — chi tiết ở [content-authoring.md](content-authoring.md).
- Portal trỏ tới `targetMapCode` + `targetSpawnId` (id spawn point, không phải toạ độ).
