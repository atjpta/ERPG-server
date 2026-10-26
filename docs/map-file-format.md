# Map: định nghĩa (server) + layout (Unity)

Map gồm hai nguồn, ghép lúc `yarn seed` thành row `game_maps`:

| Nguồn                                         | Ai sở hữu | Chứa gì                                                                                                                                                                                                                                                               |
| --------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Định nghĩa** `maps/definitions/<code>.json` | Server    | **Config**: loại map, `minLevel`, số người/kênh, PvP, khoảng level quái, nhóm quái ở từng marker, NPC và vật thể (cổng, bệ teleport, bảng thông báo, điểm thu thập) ở slot nào + chức năng riêng của slot (đích cổng...), dungeon (chamber, phase, thưởng, level cap) |
| **Layout** `maps/data/<code>.map.json`        | Unity     | **Vị trí/hình học**: kích thước map, vị trí các marker, collider, hình học chamber                                                                                                                                                                                    |

Config chỉnh trong định nghĩa rồi `yarn seed` (admin sửa row `game_maps` qua `/admin/maps` cho các trường cơ bản, nhưng seed lại sẽ ghi đè). Unity **không** nhập số người, PvP, level quái, loại quái, đích portal — chỉ kéo marker tới đúng chỗ.

## Quy trình

1. Server khai báo marker trong `definitions/<code>.json` (id ổn định, không đổi sau khi phát hành).
2. `yarn config:export` xuất `map-markers.json`: danh sách marker từng map. Unity dựng sẵn mọi marker theo danh sách này (đủ id), người làm map chỉ chỉnh **vị trí**.
3. Unity export `<code>.map.json` → commit vào `src/modules/maps/data/` → `yarn seed` ghép + validate.
4. Marker có trong định nghĩa nhưng chưa có vị trí: bị bỏ qua và seed/`yarn dev` cảnh báo `Unity chưa đặt vị trí marker: ...`. Marker trong layout mà định nghĩa không có: **lỗi seed**. Map chưa có file: row placeholder `inactive` + cảnh báo.

## Layout `<mapCode>.map.json`

Toạ độ theo **tile**, **cùng hệ với Unity**: gốc (0, 0) ở **giữa map**, x sang phải, **y hướng lên**; biên map là `x ∈ [-width/2, width/2]`, `y ∈ [-height/2, height/2]`.
Server dùng nguyên giá trị Unity (vị trí của transform, đơn vị = tile), không đổi gì khi export. Hình chữ nhật (`colliders`, `bounds`, cổng) neo ở **góc nhỏ nhất (dưới-trái)**: `x, y` là góc có giá trị nhỏ nhất, vùng trải tới `x + w`, `y + h`
(từ `BoxCollider2D`: `x = center.x - size.x / 2`, `y = center.y - size.y / 2`). Tên file = `code` + `.map.json`.

```json
{
    "code": "greenfield_plains",
    "width": 56,
    "height": 64,
    "tileSize": 16,
    "spawnPoints": [{ "id": "default", "x": -11.5, "y": 28 }],
    "colliders": [{ "x": -28, "y": -32, "w": 56, "h": 1 }],
    "monsters": [{ "id": "g01", "x": -20.57, "y": 18.01 }],
    "npcs": [
        { "id": "npc_blacksmith", "x": 4.5, "y": 24.1, "direction": "left" },
        { "id": "to_village", "x": -11.5, "y": 30, "direction": "up" }
    ],
    "chambers": [
        {
            "id": "c1",
            "bounds": { "x": -28, "y": 12, "w": 20, "h": 20 },
            "entry": { "x": -26, "y": 30 },
            "exit": { "x": -10, "y": 14 }
        }
    ]
}
```

- `spawnPoints` / `monsters` / `npcs`: `{id, x, y}` theo id server liệt kê (`npcs` gồm cả vật thể; `direction` NPC nhìn `left`/`right`, cổng chỉ `up`/`down`/`left`/`right`). `kind` của spawn (`default`/`respawn`/`arrival`) là config của server.
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
    npcs: [
        { id: "npc_hunter", npcCode: "hunter_garrick" }, // hướng nhìn do Unity chọn ở marker (layout `direction`)
        // vật thể cũng là NPC (`npcs.kind = "object"`): `functions` của slot thay `functions` của NPC, `radius`/`conditions` tuỳ chọn
        {
            id: "forest_to_village", npcCode: "portal_gate", radius: 1.5,
            functions: [{ id: "enter", type: "portal", config: { targetMapCode: "greenfield_village", targetSpawnId: "from_field" } }],
        },
    ],}
```

- **Nhóm quái** (`monsterGroups`): mỗi marker có 1 nhóm gồm nhiều loại quái (`members`). Các con trải quanh marker — hàng ngang tối đa 3 con căn giữa marker, hàng sau nằm dưới, cách nhau 2 tile; mỗi con vẫn hồi sinh riêng. Không đặt toạ độ từng con.
    - Mỗi `member`: `monsterCode`, `count`, `type` (`normal` mặc định / `elite` / `boss` cố định, hoặc `random` = roll normal/elite mỗi lần sinh, giới hạn `maxElitesPerMap`), `rarity?`, `minLevel?`/`maxLevel?` (không có thì dùng `monsterLevel` của map, rồi level gốc của monster).
    - Cấu hình roll (`eliteChance`, `maxElitesPerMap`, trọng số độ hiếm) là master data `monster_spawn_config`.
- **NPC và vật thể** (`npcs`): slot `{id, npcCode, radius?, conditions?, functions?}`. `npcCode` trỏ tới template ở bảng `npcs` (thoại, bán kính mặc định, chức năng, `kind`, `autoOpen`); slot chỉ ghi đè phần riêng của chỗ đặt. Id slot **duy nhất toàn hệ thống** (client gửi `interactNpc { id }`, quest `interact` và `teleportId` tham chiếu theo id).
    - `kind = "npc"`: nhân vật (thoại, quest, marker, vùng chặn). `kind = "object"`: vật thể (cổng, bệ teleport, bảng thông báo, điểm thu thập) — diện mạo là chính `npcCode` (`portal_gate`, `portal_dungeon`, `teleport_pad`, `notice_board`), không marker quest, không vùng chặn.
    - `autoOpen = true`: bấm là chạy chức năng đầu tiên (của slot, hoặc của NPC), không mở thoại. `autoOpen = false`: chọn thoại theo hoàn cảnh; thoại mở chức năng bằng action `open_function`.
    - Chức năng (`NpcFunctionType`) có `config` đúng kiểu: `portal` (`targetMapCode` + `targetSpawnId`, chuyển map / vào dungeon), `teleport` (`openToAll?`), `gather` (`reward`, `respawnSec`: nhặt rồi ẩn `respawnSec` giây trong kênh, `NpcWorldState.active`), cùng các chức năng giao diện `shop`, `storage`, `enhance`, `refine`, `disassemble`, `quest_board`.
- **Teleport** (chức năng `teleport`, template `teleport_pad`): bệ dịch chuyển nhanh, **không có đích cố định**. Bấm vào bệ (`interactNpc`) → server ghi phiên mở bệ rồi gửi `teleportList` (mọi map active có bệ teleport, trừ dungeon và map hiện tại, kèm `minLevel` / `available`); client chọn map → `teleportTo {mapCode}` → player xuất hiện tại bệ teleport của map đó (đổi room như portal, kiểm `minLevel`). Server kiểm lại: còn sống, không ở dungeon, **đang mở bệ và còn đứng gần nó** (`NpcFunctionSessionManager.check`), **đã từng đến map đích** (flag `visited.<mapCode>` trong `player_states.flags`, đặt khi vào world room của map đó) và đủ level. Map nào có slot với chức năng teleport (và Unity đã đặt vị trí) thì là điểm đến; map có nhiều bệ thì dùng bệ đầu tiên. Bệ có `openToAll: true` (ví dụ `training_room`) thì ai cũng teleport tới map đó được, không cần đã từng đến (vẫn kiểm `minLevel`).
- Cổng (`portal`) trỏ tới `targetMapCode` + `targetSpawnId` (id spawn point trong định nghĩa map đích) — `validateDefinitionRefs` kiểm lúc seed (và `ContentRefsCheck` kiểm chức năng khai ở template NPC).
- **Dungeon** (`type: "dungeon"` ⇔ có khối `dungeon`): `{maxLevel, timeLimitSec?, clearReward?, chambers[]}`. Level quái = ceil(trung bình level người trong instance), tối đa `maxLevel`. Mỗi chamber:
    - `phases[]`: `{id, delaySec, groups[]}` — `groups` là các nhóm quái như trên (marker id duy nhất trong map). Phase đầu `delaySec = 0`, phase sau tăng dần; phase k spawn khi đủ `delaySec` giây kể từ lúc chamber bắt đầu. Phải hạ **hết quái mọi phase** mới mở cổng `exit`. Quái trong dungeon không hồi sinh; `type: "elite"` / `"boss"` đặt trong member.
    - `isBoss` (chỉ chamber cuối), `hasExit` (mặc định có, trừ chamber boss), `exitRadius`.
    - Cổng exit là vật thể động id `exit_<chamberId>` (chưa implement; không khai trong `npcs`).
    - Vào dungeon: đặt slot `portal_dungeon` (chức năng `portal`) trong field trỏ tới code dungeon + id spawn arrival của dungeon; server lưu chỗ đứng cũ, cấp `instanceId` riêng (`mapChange.roomName = "dungeon"`).
    - Sức chứa dungeon = cài đặt party (`party_config.maxMembers`), không khai `maxPlayersPerChannel` cho dungeon.
    - Quái (kể cả boss) trong dungeon rớt như bình thường. Thưởng riêng khi clear dungeon: `clearReward` `{exp, currency, items, slots?, dropItems?, equipment?}` — `exp`/`currency`/`items` cố định; nếu có `slots` thì mỗi item cố định chiếm 1 slot, mỗi item trong `dropItems` (`{itemCode, min, max, rate}`) trúng tỉ lệ chiếm thêm 1 slot, `equipment` `{biome, rarity}` (trọng số rarity) lấp các slot còn lại (chamber thường không có thưởng riêng).
