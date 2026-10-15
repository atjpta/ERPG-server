# Authoring: Unity ↔ server

Mọi thứ nối Unity với server qua **code** (`swordsman`, `slime`, `archer_rain_arrows`...). Trong Unity, mọi chỗ cần code đều chọn từ dropdown (`[ServerCode]`), không gõ tay. Lệnh duy nhất cần nhớ: **`Tools/ERPG/Sync Server`** (hoặc tab _Sync_ của `Tools/ERPG/Authoring Hub`).

## Ai sở hữu dữ liệu nào

| Dữ liệu                                                                     | Nguồn sự thật                                     | Đường đi                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Layout map: collider, spawn, vùng monster, vị trí NPC, vật thể, chamber     | **Unity** (prefab map)                            | Unity → `src/modules/maps/data/<code>.map.json`        |
| Hitbox / collider thân của monster và class                                 | **Unity** (child `HitBox`, `Collider` của prefab) | Unity → `src/modules/bodies/data/entity-bodies.json`   |
| Độ dài clip animation (đòn đánh monster, skill class)                       | **Unity** (Animator của prefab)                   | Unity → `src/modules/bodies/data/anim-clips.json`      |
| Chỉ số, damage, cooldown, castRange, hit event, combo, level, hiệu ứng buff | **Server** (seed)                                 | Server → `Assets/ERPG/Resources/Config/skills.json`    |
| Danh sách code (class, monster, npc, item, skill, quest, map, gate...)      | **Server**                                        | Server → `Assets/ERPG/ServerData/codes.json`           |
| Marker mỗi map (spawn, nhóm quái, NPC, vật thể, chamber)                    | **Server** (`map-definitions.ts`)                 | Server → `ServerData/map-markers.json`                 |
| NPC, hội thoại, quest, locale key                                           | **Server**                                        | Server → `ServerData/content.json`, `locale-keys.json` |
| Prefab hiệu ứng skill, icon, âm thanh, anim                                 | **Unity**                                         | Gắn với server qua code                                |

Quy tắc: thứ cần mắt nhìn và kéo thả (vị trí, kích thước vật lý, thời gian anim) đo ở Unity rồi export; con số cân bằng seed ở server. File do công cụ sinh có dòng `comment: ... Do not edit`.

## Sync Server làm gì (theo thứ tự)

1. Export `entity-bodies.json` và `anim-clips.json` từ prefab (server đọc ngay khi khởi động nên phải đi trước).
2. `yarn config:export` — danh sách code mới nhất.
3. **Validate** mọi code trong Unity so với server (`CodeLinkValidator`); lỗi thì dừng, không đụng server.
4. Tạo prefab + marker còn thiếu cho map server định nghĩa, rồi export layout map (map còn lỗi bị bỏ qua và được nêu tên).
5. `yarn db:migrate`, `yarn seed`, `yarn config:export`, `yarn schema:generate`.
6. Dừng tiến trình đang nghe cổng 2567, chạy lại `yarn dev`, chờ cổng mở. Ghi lại trạng thái đã sync.

Chế độ khác: **Validate** (chỉ kiểm tra), **Sync Seed** (phía server: seed + export lại + restart). Trước khi Play, nếu map / monster / class prefab đã đổi từ lần sync trước thì Unity hỏi (hoặc tự sync nếu bật _Auto Sync Before Play_).

## Việc thường gặp

**Thêm map mới.** Thêm định nghĩa vào `src/modules/maps/seeds/map-definitions.ts` → _Sync Server_ (Unity tự tạo prefab từ `BaseRoom`/dungeon mẫu cùng các marker) → kéo marker vào đúng chỗ, vẽ collider → _Sync Server_ lần nữa. Tab _Maps_ của Hub liệt kê marker chưa đặt.

**Thêm / sửa monster.** Seed ở `monster.seed-data.ts` (chỉ số, biome, level) và `monster.seed.ts`. Prefab trong Unity phải có child `HitBox` và `Collider` (BoxCollider2D) và clip `Attack1`; thêm vào bảng _MonsterPrefabs_. Hitbox, collider, thời gian đòn đánh lấy từ prefab, không khai báo ở server.

**Chỉnh collider thân.** Sửa BoxCollider2D `HitBox` / `Collider` của prefab → _Sync Server_. Player đã tồn tại cũng nhận body mới khi vào phòng.

**Thêm / sửa skill (kể cả combo).** Sửa `skill.seed.ts`: hit event, castRange, cooldown, `animationMs`. Combo đánh thường là các skill `basicAttack` của owner theo thứ tự cột `skills`. Trong Unity: thêm clip `<tên>` (skill `archer_rain_arrows` = clip `rain_arrows` trong Animator của prefab `archer`) và prefab hiệu ứng vào bảng _SkillEffectPrefabs_ (code chọn từ dropdown). Xem hit event vẽ trong Scene ở tab _Skills_ của Hub. Khi seed, server cảnh báo nếu skill dài hơn clip hoặc hit rơi sau khi clip kết thúc.

**Thêm NPC.** Seed NPC + hội thoại ở server, thêm slot trong định nghĩa map, thêm prefab vào _NpcPrefabs_. Collider NPC hiện vẫn lấy từ DB (`colliderWidth/Height`).

**Đổi tên / xoá một code ở server.** _Sync Server_ hoặc _Validate_ liệt kê mọi chỗ Unity còn dùng code cũ (tab _Codes_, bấm _Select_ để nhảy tới asset). Prefab chưa nằm trong library cũng được báo.

## Skill Lab và Map Lab

Hai cửa sổ trong Unity để tạo skill / map mà không viết code server. Chúng ghi **file dữ liệu** vào server, seed đọc cùng với dữ liệu trong code; skill/map viết trong `skill.seed.ts` / `map-definitions.ts` thì không sửa ở Lab (dùng _copy of_ để làm biến thể).

**Skill Lab** (`Tools/ERPG/Skill Lab`) → `src/modules/skills/data/<code>.skill.json` (schema `skill-file.schema.ts`).

- Chọn class, chọn **animation clip** của class (code = `<class>_<clip>`), chọn template (cận chiến, đạn, vùng đất, aura buff, hồi đồng đội) hoặc copy một skill có sẵn.
- Đặt hit theo **frame** của clip ("Set tick"), nhập hình/damage/stun/đẩy lùi, khối `projectile` / `area` / `aura` / `allies` theo loại.
- Xem trước hình trúng đòn ngay trong Scene (cùng công thức hitbox của server) và timeline cạnh độ dài clip.
- Cảnh báo: code trùng, animation dài hơn clip, hit rơi sau khi clip hết, thiếu prefab hiệu ứng (thêm vào _SkillEffectPrefabLibrary_ ngay trong Lab).
- _Save and apply_ xuất độ dài clip, seed, restart server. Skill được cấp cho class ở vị trí `slot` (mặc định cuối danh sách).
- Xoá file không xoá row DB; muốn gỡ hẳn thì thêm code vào `RETIRED_SKILL_CODES` trong `skill.seed.ts`.

**Map Lab** (`Tools/ERPG/Map Lab`) → `src/modules/maps/definitions/<code>.json` (schema `map-definition.schema.ts`).

- Tạo map field / town / dungeon, hoặc copy marker từ map có sẵn: spawn point, nhóm quái (dropdown monster, số lượng, loại, level), slot NPC, portal (chọn map và spawn đích), bảng thông báo, teleport, dungeon (chamber, phase, nhóm quái, cổng).
- Phần Lab không có ô (phần thưởng gather / clear, điều kiện) được giữ nguyên trong file.
- _Save and create prefab_ chạy `yarn config:export` (server ghi marker của map mới), dựng prefab từ `BaseRoom`/mẫu dungeon cùng mọi marker, rồi mở prefab: chỉ còn đặt vị trí marker và vẽ collider, sau đó _Sync Server_.
- Kiểm trùng id (kể cả id vật thể trùng giữa các map), portal trỏ vào map/spawn có thật, một spawn `default`, chamber cuối là boss, phase tăng dần.

## Nơi dữ liệu tới tay client

Asset không còn nằm trong `Resources` nếu không phải tải theo đường dẫn: âm thanh (`SfxBank`), icon item (`ItemIconBank`), idle class (`ClassIdles`) được `Bootstrap` đăng ký lúc khởi động; icon UI gắn thẳng vào prefab. `Resources` chỉ còn `Config` (skills.json, các bảng prefab), `Locales` và prefab do các bảng đó nạp.

## Kiểm tra

- Unity: `Tools/ERPG/Validate Codes`, hoặc chạy EditMode tests (`ERPG.Tests.Editor`): code đủ mọi loại, không field `code` nào gõ tay, mọi monster có body và clip, export lặp lại ra cùng file.
- Server: `yarn test`, `yarn typecheck`, `yarn lint`.
