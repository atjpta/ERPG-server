# Authoring: Unity ↔ server

Mọi thứ nối Unity với server qua **code** (`swordsman`, `slime`, `archer_rain_arrows`...). Trong Unity, mọi chỗ cần code đều chọn từ dropdown (`[ServerCode]`), không gõ tay. Lệnh duy nhất cần nhớ: **`Tools/ERPG/Sync Server`** (hoặc tab _Sync_ của `Tools/ERPG/Authoring Hub`).

## Ai sở hữu dữ liệu nào

| Dữ liệu                                                                                                                     | Nguồn sự thật                                                                                | Đường đi                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Map: layout (collider, vị trí marker) và định nghĩa (loại, level, quái của nhóm, đích portal, chamber, phần thưởng dungeon) | **Unity** (prefab map: `MapAuthoring` + marker)                                              | Unity → `src/modules/maps/data/<code>.map.json`                                                                                   |
| Định nghĩa map: loại, level, spawn, nhóm quái, NPC, portal, chamber dungeon, thưởng                                         | **Unity** (Map Lab)                                                                          | Unity → `src/modules/maps/data/definitions/<code>.json`                                                                           |
| Skill của class, đòn đánh của monster và dash: chỉ số, damage, cooldown, castRange, hit event, combo, level, hiệu ứng buff  | **Unity** (component `SkillSetAuthoring` trên prefab class / monster, asset _Shared Skills_) | Unity → `src/modules/skills/data/<code>.skill.json`; server seed rồi trả `skills.json` về                                         |
| Tầm chọn / giữ / quay mặt target, Auto Battle, tầm thấy / đuổi / đi dạo của quái                                            | **Unity** (asset _Ranges_ + component trên prefab quái / NPC)                                | Unity (file sinh tự động, không sửa tay) → `src/modules/master-data/data/*.json` → seed ghi vào master data; admin không sửa được |
| Hitbox / collider thân của monster và class, collider chân của NPC                                                          | **Unity** (child `HitBox`, `Collider` của prefab; NPC không có prefab riêng dùng `BaseNpc`)  | Unity → `src/modules/bodies/data/entity-bodies.json`                                                                              |
| Độ dài clip animation (đòn đánh monster, skill class)                                                                       | **Unity** (Animator của prefab)                                                              | Unity → `src/modules/bodies/data/anim-clips.json`                                                                                 |
| Chỉ số monster, kinh tế, trang bị, level, quest, hội thoại, NPC, locale key, các master data còn lại                        | **Server** (seed / admin)                                                                    | Server → `ServerData/content.json`, `locale-keys.json`                                                                            |
| Danh sách code (class, monster, npc, item, skill, quest, map, gate...)                                                      | **Server**                                                                                   | Server → `Assets/ERPG/ServerData/codes.json`                                                                                      |
| Marker mỗi map (spawn, nhóm quái, NPC, vật thể, chamber)                                                                    | Suy ra từ định nghĩa map (sinh từ prefab)                                                    | Server → `ServerData/map-markers.json`                                                                                            |
| Prefab hiệu ứng skill, icon, âm thanh, anim                                                                                 | **Unity**                                                                                    | Gắn với server qua code                                                                                                           |

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

**Thêm map mới.** Mở _Map Lab_, chọn một map gần giống, nhập code mới và _Clone_ (prefab được copy, đăng ký vào _MapPrefabs_) → mở prefab sửa `MapAuthoring` và các marker (quái, portal, NPC, chamber), kéo marker vào đúng chỗ, vẽ collider → _Save & Apply_. Tab _Maps_ của Hub liệt kê lỗi và marker chưa đặt.

**Thêm / sửa monster.** Số của quái sửa trực tiếp trong Inspector của prefab (component _Monster Authoring_): mỗi số có giá trị mặc định chung (asset _Monster Defaults_, _Ranges_), tick để đặt số riêng. _Monster Lab_ chỉ liệt kê, xem và clone quái (copy prefab + thêm vào bảng _MonsterPrefabs_). File `monsters/data/*.monster.json`, `monster-defaults.json` và các file master data tầm được sinh từ prefab / asset khi lưu prefab hoặc _Save & Apply_ — đừng sửa tay. Đòn đánh là skill file của quái (_Skill Lab_). Prefab phải có child `HitBox`, `Collider` và clip `Attack1`.

**Chỉnh collider thân.** Sửa BoxCollider2D `HitBox` / `Collider` của prefab → _Sync Server_. Player đã tồn tại cũng nhận body mới khi vào phòng.

**Thêm / sửa skill (kể cả combo).** Skill sửa trong Inspector của prefab chủ: component _Skill Set Authoring_ trên prefab class (thứ tự trong list = slot, đòn đánh thường lên đầu và thành combo) hoặc prefab monster; skill không thuộc ai (dash) nằm trong asset _Shared Skills_. _Skill Lab_ chỉ liệt kê, xem, thêm skill mới (từ template hoặc copy skill khác) vào prefab chủ. Code skill = `<chủ>_<clip>` (`archer_rain_arrows` = clip `rain_arrows` trong Animator của prefab `archer`); prefab hiệu ứng vào bảng _SkillEffectPrefabs_. File `skills/data/*.skill.json` được sinh từ prefab khi lưu prefab hoặc _Save & Apply_ — đừng sửa tay. Khi seed, server cảnh báo nếu skill dài hơn clip hoặc hit rơi sau khi clip kết thúc.

**Thêm NPC.** Seed NPC + hội thoại ở server, thêm slot trong định nghĩa map, thêm prefab vào _NpcPrefabs_. Collider NPC hiện vẫn lấy từ DB (`colliderWidth/Height`).

**Đổi tên / xoá một code ở server.** _Sync Server_ hoặc _Validate_ liệt kê mọi chỗ Unity còn dùng code cũ (tab _Codes_, bấm _Select_ để nhảy tới asset). Prefab chưa nằm trong library cũng được báo.

## Tab Build của Hub

Môi trường và phiên bản không còn phải mở asset: tab _Build_ sửa thẳng `Env` và `Version`. _Environment_: môi trường Editor dùng và môi trường bản build dùng, cùng URL server, Google client id, secret và token thử của từng môi trường (secret và token được che, bật _Show secrets_ để xem). _Version_: app / build / update, nút + tăng số (tăng bậc trên thì reset bậc dưới), và _Apply to Player Settings_ ghi `x.y.z` vào bundle version, `app × 10000 + build × 100 + update` vào Android version code. Hai việc vặt cũng ở đây: áp logo làm icon và cập nhật danh sách modal prefab (cả hai vẫn tự chạy trước khi build / khi prefab modal đổi).

## Monster Lab

_Monster Lab_ (menu, hoặc tab _Monsters_ của Hub) chỉ tạo / clone / xem: danh sách quái với số hiệu lực (mặc định hay riêng), nút mở prefab để sửa, clone một quái thành quái mới (code snake_case, copy prefab, thêm vào _MonsterPrefabs_), xem giá trị mặc định. Sửa số: Inspector của prefab (component _Monster Authoring_, vòng tròn tầm vẽ trong Scene khi chọn) hoặc asset _Monster Defaults_.

## Skill Lab và Map Lab

Hai cửa sổ trong Unity để tạo và sửa **mọi** skill / map mà không viết code server. Chúng ghi **file dữ liệu** vào server; seed chỉ đọc các file đó (`skill.seed.ts` chỉ còn danh sách skill đã gỡ, và không còn `map-definitions.ts`). Bản cũ trong code nằm ở lịch sử git.

**Skill Lab** (menu _Skill Lab_) liệt kê skill theo chủ (class / monster / chung), xem số và hit, thêm skill mới; sửa ở prefab chủ. File sinh ra: `src/modules/skills/data/<code>.skill.json` (schema `skill-file.schema.ts`).

- Trên prefab chủ: chọn **animation clip** (class: code = `<class>_<clip>`; monster: `<monster>_attack` = clip `Attack1`, `<monster>_attack2` = `Attack2`), template (cận chiến, đạn, vùng đất, aura buff, hồi đồng đội) hoặc copy skill có sẵn từ Lab. **Offset** của mỗi hit (`offsetX` về phía trước theo hướng mặt / ngắm, `offsetY` lên trên, đơn vị ô) dời vùng đánh, chỗ đạn bắt đầu và chỗ vùng (AREA) tính tầm; server và client dự đoán dùng cùng công thức (`offsetSkillOrigin`).
- Đặt hit theo **frame** của clip ("Set tick"), nhập hình/damage/stun/đẩy lùi, khối `projectile` / `area` / `aura` / `allies` theo loại.
- Xem trước hình trúng đòn ngay trong Scene (cùng công thức hitbox của server) và timeline cạnh độ dài clip.
- **Collider từng frame:** mỗi hit event là collider của một thời điểm. Muốn vẽ một nhát chém theo từng frame của anim, đặt nhiều hit event cùng **Hit group** (ô trong Skill Lab, hoặc nút _Make frames_ để sinh sẵn một hit mỗi frame trong khoảng, rồi chỉnh hình từng frame). Các frame cùng group là **một hit**: mục tiêu bị trúng ở frame đầu tiên collider chạm nó, các frame sau của group bỏ qua mục tiêu đó. Số hit của skill = số group cộng số hit không group (mỗi hit không group là một hit riêng, như `swordsman_cross_slash` có hai nhát). Group chỉ áp cho hit thường; đạn / vùng là hit riêng. Server (`claimGroupHit`) và client dự đoán dùng cùng quy tắc.
- Cảnh báo: code trùng, animation dài hơn clip, hit rơi sau khi clip hết, thiếu prefab hiệu ứng (thêm vào _SkillEffectPrefabLibrary_ ngay trong Lab).
- _Save and apply_ xuất độ dài clip, seed, restart server. Skill được cấp cho class ở vị trí `slot` (mặc định cuối danh sách).
- Xoá file không xoá row DB; muốn gỡ hẳn thì thêm code vào `RETIRED_SKILL_CODES` trong `skill.seed.ts`.

**Map Lab** (menu _Map Lab_) → `src/modules/maps/data/definitions/<code>.json` (schema `map-definition.schema.ts`).

- Map Lab chỉ liệt kê, xem và clone: clone một prefab map thành map mới (đổi code, marker đi theo). Mọi thứ khác sửa trên prefab map: loại map, level, số người, PvP, dungeon (`MapAuthoring`); nhóm quái (danh sách quái trên marker nhóm), slot NPC (`npcCode`), portal / teleport / biển báo / điểm thu thập (marker object), spawn point (`kind`), chamber và các đợt quái của dungeon (marker chamber). File `maps/definitions/<code>.json` và `maps/data/<code>.map.json` được sinh từ prefab, đừng sửa tay.
- Phần Lab không có ô (phần thưởng gather / clear, điều kiện) được giữ nguyên trong file.
- _Save and create prefab_ chạy `yarn config:export` (server ghi marker của map mới), dựng prefab từ `BaseRoom`/mẫu dungeon cùng mọi marker, rồi mở prefab: chỉ còn đặt vị trí marker và vẽ collider, sau đó _Sync Server_.
- Kiểm trùng id (kể cả id vật thể trùng giữa các map), portal trỏ vào map/spawn có thật, một spawn `default`, chamber cuối là boss, phase tăng dần.

## Tầm (Ranges)

Số mặc định nằm trong asset _Ranges_ (`Assets/ERPG/Authoring`): `player_target_config.json` (tầm chọn / giữ / quay mặt target theo class, Auto Battle), `monster_ai_config.json` (tầm thấy, đuổi, đi dạo của quái, thời gian đứng nghỉ), `npc_config.json` (tầm nói chuyện). Quái / NPC cần số khác thì tick số đó trên prefab của nó (_Monster Authoring_ / _Npc Authoring_). Tab _Ranges_ của Hub chỉ xem giá trị hiệu lực và vẽ vòng tròn quanh object đang chọn trong Scene, kèm tầm đánh của một skill để so. Các file được sinh tự động; client nhận phần target qua `skills.json`. API admin từ chối sửa các key này (`MASTER_DATA_READ_ONLY`).

## Nơi dữ liệu tới tay client

Asset không còn nằm trong `Resources` nếu không phải tải theo đường dẫn: âm thanh (`SfxBank`), icon item (`ItemIconBank`), idle class (`ClassIdles`) được `Bootstrap` đăng ký lúc khởi động; icon UI gắn thẳng vào prefab. `Resources` chỉ còn `Config` (skills.json, các bảng prefab), `Locales` và prefab do các bảng đó nạp.

## Kiểm tra

- Unity: nút _Validate codes_ ở tab _Codes_ của Hub, hoặc chạy EditMode tests (`ERPG.Tests.Editor`): code đủ mọi loại, không field `code` nào gõ tay, mọi monster có body và clip, export lặp lại ra cùng file.
- Server: `yarn test`, `yarn typecheck`, `yarn lint`.

## Shared catalog code enums

Every entity using `baseWithCodeColumns` must pass its module's code enum, for example
`baseWithCodeColumns(ClassCode)`. Register the enum in
`src/seeds/catalog-codes.constant.ts` so it reaches Unity.

When adding or removing a catalog entry (including a map, monster or skill authored in Unity),
update the corresponding `*-code.enum.ts` and its seed/authoring data together.
`yarn seed` requires both lists to match. Code sync rejects unregistered or duplicate authored codes,
but allows a registered code to await Unity authoring, so you can select it in the creation dropdown.
QuestCode includes the three daily quests.

Run `yarn codes:generate` to sync without a database. It writes
`../ERPG/Assets/ERPG/ServerData/codes.json` for Editor dropdowns and string constants under
`../ERPG/Assets/ERPG/Scripts/Schema/` for runtime code, for example
`ERPG.Schema.ClassCode.SWORDSMAN` and `ERPG.Schema.SkillCode.DASH`.
C# constants preserve the string values used by JSON/network payloads.
Both `yarn config:export` and `yarn schema:generate` also sync these catalogs.

Client creation forms and skill inspectors select codes exclusively from server lists. Register a new
code in the server enum, run `yarn codes:generate`, then choose that code when creating its Unity asset.
Missing lists disable editing. Runtime comparisons use the generated `ERPG.Schema.*Code` constants.
