# Skills module

Module lưu catalog skill trong PostgreSQL; `SkillService.setCacheData()` nạp chúng vào cache theo `code`. Mỗi skill gắn với `ownerType` và `ownerCode` (ví dụ monster `orc` hoặc class `swordman`).

Mỗi skill có `castRange`; `skillHitEvents` mô tả nhiều lần đánh, mỗi event có `triggerTicks` (số tick tính từ lúc bắt đầu đánh), hitbox và `range` riêng (đơn vị tile). Giá trị seed được tác giả theo nhịp 20 tick/giây (50 ms/tick), sau đó server quy đổi sang tick mô phỏng 40 Hz. `levelConfig` và `effects` lưu hệ số theo cấp.

Hiện dữ liệu được quản lý bằng seed. `SkillSeed` tạo skill `orc_slash` và ba bước đánh Swordman (`swordman_slash_1`, `swordman_slash_2`, `swordman_slash_3`): hit ở 150 ms; combo 2 hit ở 150/300/600 ms; combo 3 hit ở 200/250/300/350/350 ms (5 nhát đâm frame 5–9 của anim Attack03 chạy speed 2.4). `castTimeMs` là thời lượng cả đòn (khóa di chuyển): 400/750/500 ms.

## Dữ liệu cho client

Client không giữ bản copy tay nào của skill. `yarn seed` (bước cuối) và `yarn config:export` đọc skill đang bật trong DB rồi ghi `skills.json` vào thư mục truyền làm tham số trong `package.json` (hiện là `../ERPG/Assets/ERPG/Resources/Config`, giống `schema:generate`; bỏ qua nếu thư mục không tồn tại) — xem `src/seeds/client-config.export.ts`. Giá trị trong file đã quy đổi sẵn như server dùng: `triggerTicks`/`durationTicks` theo tick mô phỏng 40 Hz, damage = `damageBase + attack × damageAttackScaling`. Client đọc qua `SkillConfigs` (predict thời lượng đòn, dự đoán hit, vẽ hitbox).

Sửa skill → `yarn seed --force` (hoặc sửa DB rồi `yarn config:export`) → commit `skills.json` bên client cùng lúc với server.

Hit cuối phải nằm cách lúc kết thúc đòn ít nhất 150 ms (`HIT_CONFIRM_BUDGET_MS`): client chạy anim ngay lúc bấm, sát thương về sau khoảng 1 RTT, nên khoảng này giúp sát thương hiện ra trước khi anim xong mà không cần cho hit nổ sớm hơn frame chém. `SkillService` cảnh báo khi skill vi phạm. Skill cũ `swordman_slash` được tắt khi seed chạy. Dùng `yarn seed --force` để cập nhật mốc hit trong database hiện có.

Chạy `yarn db:migrate` rồi `yarn seed` để tạo schema và thêm skill. Dùng `yarn seed --force` để ghi đè các giá trị seed hiện có.

## Skill của player / monster

`player_states.skills` và `monsters.skills` là jsonb `[{ skillId, level }]` (`OwnedSkill`). Các skill loại `MELEE`, theo đúng thứ tự trong mảng, là combo đánh thường (`skillService.getBasicAttackCombo`): player có 3 skill MELEE → combo 3 đòn; monster dùng skill MELEE đầu tiên. Player mới nhận `PLAYER_DEFAULT_SKILL_CODES`; `PlayerSkillSeed` gán bộ đó cho player cũ đang rỗng. Danh sách này được gửi xuống client qua world state (`OwnedSkillState`), client tra `skills.json` theo `skillId`. `level` đã lưu nhưng chưa dùng để tính damage.
