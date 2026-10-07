# Skills module

Module lưu catalog skill trong PostgreSQL; `SkillService.setCacheData()` nạp chúng vào cache theo `code`. Mỗi skill gắn với `ownerType` và `ownerCode` (ví dụ monster `orc` hoặc class `swordsman`).

Mỗi skill có `castRange`; `skillHitEvents` mô tả nhiều lần đánh, mỗi event có `triggerTicks` (số tick tính từ lúc bắt đầu đánh), hitbox và `range` riêng (đơn vị tile). Giá trị seed được tác giả theo nhịp 20 tick/giây (50 ms/tick), sau đó server quy đổi sang tick mô phỏng 40 Hz. `levelConfig` và `effects` lưu hệ số theo cấp.

Hiện dữ liệu được quản lý bằng seed. `SkillSeed` tạo đòn đánh thường (`basicAttack`) của 3 class khởi đầu, canh theo anim `Assets/ERPG/Animation/PackCharacters/<Class>`:

| Class     | Skill                                                             | Cách gây damage                                                                 |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Swordsman | `swordsman_basic_attack` (MELEE)                                  | HITBOX: 1 nhát chém ở frame 3, `castTimeMs` 300                                 |
| Archer    | `archer_basic_attack` (PROJECTILE)                                | Mũi tên rời cung ở 500 ms, bay 12 ô/s, tối đa 6 ô, trúng con đầu tiên (DESTROY) |
| Cleric    | `cleric_basic_attack` (GROUND, sát thương phép theo MAGIC_ATTACK) | Vùng tròn bán kính 0.6 đặt ở chân mục tiêu lúc 350 ms, nổ sau 150 ms            |

Cùng với `orc_slash` và `{monster}_attack` của monster. Mỗi class chỉ có 1 đòn đánh thường (clip anim tên `basic_attack`); đòn thêm sẽ bổ sung sau. Skill cũ (`swordsman_slash_*`, `swordsman_attack_*`, `swordman_slash`, `archer_attack`, `cleric_attack`) bị xoá khi seed chạy.

### Cách gây damage của hit event (`delivery`)

- `HITBOX` (mặc định): vùng `shape`/`offset` quanh người đánh, gây damage ngay tại `triggerTicks`.
- `PROJECTILE` + `projectile { speed, maxDistance, radius, hitBehavior, maxHits }`: tại `triggerTicks` sinh một viên đạn ở `offsetX/offsetY`, bay thẳng về giữa hitbox mục tiêu đang chọn (không có → theo hướng mặt). Mỗi tick đạn bay một đoạn (quét từng bước ≤ 0.1 ô), trúng khi thân đạn (tròn `radius`) chạm hitbox; DESTROY biến mất ở mục tiêu đầu tiên, PIERCE xuyên tới `maxHits` mục tiêu.
- `AREA` + `area { delayMs, untargetedDistance }`: tại `triggerTicks` đặt vùng (`shape`/`radius` của event) ở chân mục tiêu, kéo về trong `castRange`; không có mục tiêu → cách `untargetedDistance` ô trước mặt. Sau `delayMs` gây damage cho mọi mục tiêu chạm vùng.

Room xử lý ở `src/rooms/world/services/skill-delivery.world.service.ts`; đạn và vùng nằm trong world state (`projectiles`, `areas`) để client vẽ, bị xoá khi hết. Player đánh monster luôn theo vị trí monster mà client đó đang vẽ (`rewind.lastSeenBy`), kể cả với đạn đang bay. Bên đánh là player hay monster đều dùng chung (`SkillOwner`), nên monster đánh xa có thể chuyển sang PROJECTILE/AREA chỉ bằng dữ liệu.

## Dữ liệu cho client

Client không giữ bản copy tay nào của skill. `yarn seed` (bước cuối) và `yarn config:export` đọc skill đang bật trong DB rồi ghi `skills.json` vào thư mục truyền làm tham số trong `package.json` (hiện là `../ERPG/Assets/ERPG/Resources/Config`, giống `schema:generate`; bỏ qua nếu thư mục không tồn tại) — xem `src/seeds/client-config.export.ts`. Giá trị trong file đã quy đổi sẵn như server dùng: `triggerTicks`/`durationTicks` theo tick mô phỏng 40 Hz, damage = `damageBase + attack × damageAttackScaling`. File còn có `basicAttack`, `delivery`, `projectile` và `area` (`delayTicks` đã quy đổi). Client đọc qua `SkillConfigs` (predict thời lượng đòn, dự đoán hit, vẽ hitbox, tự bay đạn / đặt vùng của chính mình). Hình đạn / hiệu ứng vùng là prefab `Resources/SkillEffects/<skill code>` bên client.

Sửa skill → `yarn seed --force` (hoặc sửa DB rồi `yarn config:export`) → commit `skills.json` bên client cùng lúc với server.

Hit cuối phải nằm cách lúc kết thúc đòn ít nhất 150 ms (`HIT_CONFIRM_BUDGET_MS`): client chạy anim ngay lúc bấm, sát thương về sau khoảng 1 RTT, nên khoảng này giúp sát thương hiện ra trước khi anim xong mà không cần cho hit nổ sớm hơn frame chém. Với AREA tính tới lúc nổ (`triggerTicks` + `delayMs`); đạn còn phải bay nên không tính được. `SkillService` cảnh báo khi skill vi phạm. Dùng `yarn seed --force` để cập nhật mốc hit trong database hiện có.

Chạy `yarn db:migrate` rồi `yarn seed` để tạo schema và thêm skill. Dùng `yarn seed --force` để ghi đè các giá trị seed hiện có.

## Skill của player / monster

`player_states.skills` và `monsters.skills` là jsonb `[{ skillId, level }]` (`OwnedSkill`). Các skill `basicAttack`, theo đúng thứ tự trong mảng, là combo đánh thường (`skillService.getBasicAttackCombo`): mỗi class hiện có 1 đòn (thêm skill `basicAttack` vào danh sách là thành combo); monster dùng skill đầu tiên. Player mới nhận skill mặc định của class (`classes.skills`); vì chưa có học skill, `ClassSeed` gán lại bộ này cho mọi player của class đang có bộ khác (`PlayerStateRepo.replaceClassSkills`). Danh sách này được gửi xuống client qua world state (`OwnedSkillState`), client tra `skills.json` theo `skillId`. `level` đã lưu nhưng chưa dùng để tính damage.
