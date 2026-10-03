# Skills module

Module lưu catalog skill trong PostgreSQL; `SkillService.setCacheData()` nạp chúng vào cache theo `code`. Mỗi skill gắn với `ownerType` và `ownerCode` (ví dụ monster `orc` hoặc class `swordman`).

Mỗi skill có `castRange`; `skillHitEvents` mô tả nhiều lần đánh, mỗi event có `triggerTicks` (số tick tính từ lúc bắt đầu đánh), hitbox và `range` riêng (đơn vị tile). Giá trị seed được tác giả theo nhịp 20 tick/giây (50 ms/tick), sau đó server quy đổi sang tick mô phỏng 40 Hz. `levelConfig` và `effects` lưu hệ số theo cấp.

Hiện dữ liệu được quản lý bằng seed. `SkillSeed` tạo skill `orc_slash` và ba bước đánh Swordman (`swordman_slash_1`, `swordman_slash_2`, `swordman_slash_3`): hit ở 150 ms; combo 2 hit ở 150/300/600 ms; combo 3 hit ở 100/150/200/250/250 ms. Thời lượng khóa di chuyển vẫn theo độ dài anim. Skill cũ `swordman_slash` được tắt khi seed chạy. Dùng `yarn seed --force` để cập nhật mốc hit trong database hiện có.

Chạy `yarn db:migrate` rồi `yarn seed` để tạo schema và thêm skill. Dùng `yarn seed --force` để ghi đè các giá trị seed hiện có.
