# Map: định nghĩa (server) + layout (Unity)

Map gồm hai nguồn, ghép lúc `yarn seed` thành row `game_maps`:

| Nguồn                                          | Ai sở hữu | Chứa gì                                                                                                                                                                                                 |
| ---------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Định nghĩa** `maps/seeds/map-definitions.ts` | Server    | **Config**: loại map, `minLevel`, số người/kênh, PvP, khoảng level quái, nhóm quái ở từng marker, NPC nào ở slot nào, portal đi đâu, vật thu thập/biển báo, dungeon (chamber, phase, thưởng, level cap) |
| **Layout** `maps/data/<code>.map.json`         | Unity     | **Vị trí/hình học**: kích thước map, vị trí các marker, collider, hình học chamber                                                                                                                      |

Config chỉnh trong định nghĩa rồi `yarn seed` (admin sửa row `game_maps` qua `/admin/maps` cho các trường cơ bản, nhưng seed lại sẽ ghi đè). Unity **không** nhập số người, PvP, level quái, loại quái, đích portal — chỉ kéo marker tới đúng chỗ.

## Quy trình

1. Server khai báo marker trong `map-definitions.ts` (id ổn định, không đổi sau khi phát hành).
2. `yarn config:export` xuất `map-markers.json`: danh sách marker từng map. Unity dựng sẵn mọi marker theo danh sách này (đủ id), người làm map chỉ chỉnh **vị trí**.
3. Unity export `<code>.map.json` → commit vào `src/modules/maps/data/` → `yarn seed` ghép + validate.
4. Marker có trong định nghĩa nhưng chưa có vị trí: bị bỏ qua và seed/`yarn dev` cảnh báo `Unity chưa đặt vị trí marker: ...`. Marker trong layout mà định nghĩa không có: **lỗi seed**. Map chưa có file: row placeholder `inactive` + cảnh báo.

## Layout `<mapCode>.map.json`

Toạ độ theo **tile**, gốc trên-trái, y hướng xuống (server). Unity: trừ nửa kích thước map, đảo dấu y. Tên file = `code` + `.map.json`.

```json
{
    "code": "greenfield_plains",
    "width": 56,
    "height": 64,
    "tileSize": 16,
    "spawnPoints": [{ "id": "default", "x": 16.5, "y": 4 }],
    "colliders": [{ "x": 0, "y": 0, "w": 56, "h": 1 }],
    "monsters": [{ "id": "g01", "x": 7.43, "y": 13.99 }],
    "npcs": [{ "id": "npc_blacksmith", "x": 32.5, "y": 7.9, "direction": "left" }],
    "interactables": [{ "id": "to_village", "x": 16.5, "y": 2, "direction": "up" }],
    "chambers": [
        {
            "id": "c1",
            "bounds": { "x": 0, "y": 0, "w": 20, "h": 20 },
            "entry": { "x": 2, "y": 2 },
            "exit": { "x": 18, "y": 18 }
        }
    ]
}
```

- `spawnPoints` / `monsters` / `npcs` / `interactables`: `{id, x, y}` theo id server liệt kê. `kind` của spawn (`default`/`respawn`/`arrival`) là config của server.
- `colliders`: rect `{x,y,w,h}` chặn đường. Server chặn trong `applyMove` bằng `collider` của entity; client phải dùng **cùng** danh sách này để dự đoán.
- `chambers` (chỉ dungeon): hình học từng chamber — `bounds`, `entry` (chỗ đặt player khi vào chamber; **chamber đầu bỏ trống** — người chơi vào ở spawn `default` của dungeon), `exit` (cổng sang chamber kế; chamber nào `hasExit = false` thì không cần).
- `contentHash` (sha1 của layout đã chuẩn hoá) lưu ở `game_maps.content_hash` — client so với hash của file trong build.
- Tên hiển thị không nằm trong file: client tra locale theo `map.{code}.name`.

## Định nghĩa (server)

```ts
{
    code: "whispering_forest", type: MapType.FIELD,
    minLevel: 10, maxPlayersPerChannel: 100, pvpEnabled: false,
    monsterLevel: { min: 10, max: 19 },
    spawnPoints: [{ id: "default", kind: "default" }, { id: "from_village", kind: "arrival" }],
    monsterGroups: [
        // nhóm hỗn hợp: 2 werewolf + 1 bat đứng quanh marker f01
        { markerId: "f01", members: [
            { monsterCode: "werewolf", count: 2, type: "random" },
            { monsterCode: "bat", count: 1, type: "random" },
        ] },
    ],
    npcs: [{ id: "npc_hunter", npcCode: "hunter_garrick" }], // hướng nhìn do Unity chọn ở marker (layout `direction`)
    interactables: [{ id: "forest_to_village", type: "portal", targetMapCode: "greenfield_village", targetSpawnId: "from_field" }],
}
```

- **Nhóm quái** (`monsterGroups`): mỗi marker có 1 nhóm gồm nhiều loại quái (`members`). Các con trải quanh marker — hàng ngang tối đa 3 con căn giữa marker, hàng sau nằm dưới, cách nhau 2 tile; mỗi con vẫn hồi sinh riêng. Không đặt toạ độ từng con.
    - Mỗi `member`: `monsterCode`, `count`, `type` (`normal` mặc định / `elite` / `boss` cố định, hoặc `random` = roll normal/elite mỗi lần sinh, giới hạn `maxElitesPerMap`), `rarity?`, `minLevel?`/`maxLevel?` (không có thì dùng `monsterLevel` của map, rồi level gốc của monster).
    - Cấu hình roll (`eliteChance`, `maxElitesPerMap`, trọng số độ hiếm) là master data `monster_spawn_config`.
- **Interactable**: `portal` (`targetMapCode` + `targetSpawnId`), `gather` (`reward`, `respawnSec`), `sign` (`dialogueCode`), kèm `code` diện mạo (`InteractableCode`), `radius`, `conditions`. Id vật thể **duy nhất toàn hệ thống** (quest tham chiếu theo id).
- **Teleport** (`type: "teleport"`, `targetTeleportId`): bệ dịch chuyển **trong cùng map** — dùng bệ này thì tới ngay vị trí bệ `targetTeleportId` (một teleport khác trong map). Muốn đi lại hai chiều thì khai cả hai bệ trỏ nhau. Không đổi room, không có `mapChange`: server đặt lại vị trí player. Bệ đích chưa được Unity đặt vị trí thì chưa dùng được. Khác `portal` (đổi map, trỏ spawn point).
- Portal trỏ tới `targetMapCode` + `targetSpawnId` (id spawn point trong định nghĩa map đích) — `validateDefinitionRefs` kiểm lúc seed.
- **Dungeon** (`type: "dungeon"` ⇔ có khối `dungeon`): `{maxLevel, timeLimitSec?, clearReward?, chambers[]}`. Level quái = ceil(trung bình level người trong instance), tối đa `maxLevel`. Mỗi chamber:
    - `phases[]`: `{id, delaySec, groups[]}` — `groups` là các nhóm quái như trên (marker id duy nhất trong map). Phase đầu `delaySec = 0`, phase sau tăng dần; phase k spawn khi đủ `delaySec` giây kể từ lúc chamber bắt đầu. Phải hạ **hết quái mọi phase** mới mở cổng `exit`. Quái trong dungeon không hồi sinh; `type: "elite"` / `"boss"` đặt trong member.
    - `isBoss` (chỉ chamber cuối), `hasExit` (mặc định có, trừ chamber boss), `exitRadius`, `clearReward?`.
    - Cổng exit là interactable động id `exit_<chamberId>` (không khai trong `interactables`).
    - Vào dungeon: đặt `portal` trong field trỏ tới code dungeon + id spawn arrival của dungeon; server lưu chỗ đứng cũ, cấp `instanceId` riêng (`mapChange.roomName = "dungeon"`).
    - Sức chứa dungeon = cài đặt party (`party_config.maxMembers`), không khai `maxPlayersPerChannel` cho dungeon.
    - Quái thường trong dungeon rớt như bình thường. **Thưởng thêm chỉ khi hạ boss**: master data `dungeon_drop_config` (seed `DEFAULT_DUNGEON_DROP_CONFIG` hoặc `PUT /admin/master-data/dungeon_drop_config`) theo code map — `expMultiplier` / `goldMultiplier` / `dropRateMultiplier`, `equipmentRate` + `equipmentRarity`, `extraItems` `[{itemCode, min, max, rate}]`; cùng với `clearReward` của chamber/dungeon.
