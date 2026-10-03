# Skills module

Module lưu catalog skill trong PostgreSQL; `SkillService.setCacheData()` nạp chúng vào cache theo `code`. Mỗi skill gắn với `ownerType` và `ownerCode` (ví dụ monster `orc` hoặc class `swordman`).

Mỗi skill có `castRange`; `skillHitEvents` mô tả nhiều lần đánh, mỗi event có `triggerMs`, hitbox và `range` riêng (đơn vị tile). `levelConfig` và `effects` lưu hệ số theo cấp.

Hiện dữ liệu được quản lý bằng seed. `SkillSeed` thêm hai skill Orc (`orc_heavy_swing`, `orc_ground_slam`) và hai skill Swordman (`swordman_slash`, `swordman_double_slash`). Đánh thường Swordman có ba hit event liên tiếp.

Chạy `yarn db:migrate` rồi `yarn seed` để tạo schema và thêm skill. Dùng `yarn seed --force` để ghi đè các giá trị seed hiện có.
