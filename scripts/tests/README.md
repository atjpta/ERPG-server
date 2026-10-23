# Test tích hợp

Chạy trên DB dev (đã `yarn db:migrate && yarn seed`), **không cần server đang chạy**:

```bash
yarn test:integration                 # tất cả
yarn test:integration friend          # một bộ: friend | mail | runtime
yarn test:integration mail inbox      # lọc theo tên bài
```

Mỗi bài tự tạo user / player tạm (`fixtures.ts`, `createStates` thêm `player_states`) và xoá khi xong. Bộ test dùng service của `modules/*` (và `PlayerRuntimeService`) trực tiếp, nên bắt được lỗi đồng thời và lỗi giữa chừng mà
`yarn smoke` (một client, tuần tự) không bắt được.

| File                         | Kiểm chứng                                                                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `friend-concurrency.test.ts` | accept / decline / cancel đồng thời (chỉ một bên thắng, DB khớp kết quả báo); giới hạn bạn / lời mời / chặn không bị vượt khi nhiều yêu cầu cùng lúc; lời mời đang chạy không tạo lại quan hệ sau khi bị chặn                 |
| `player-runtime.test.ts`     | `PlayerRuntimeService`: attach / detach theo bên dùng, `transact` (lưu ngay, rollback, `TransactAbort`, đồng thời), `mutate` (autosave chỉ ghi nhóm đổi, lưu sớm, phát lại khi trùng `transact`), gộp khi DB bị ghi từ ngoài, "crash" |
| `mail-transfer.test.ts`      | gửi / nhận / COD / thu hồi trong MỘT transaction cùng ví người chơi: không mất, không nhân đôi tiền; thu hồi đua với nhận chỉ một bên thắng; hộp thư không vượt `maxInbox` khi gửi đồng thời; dọn thư và lời mời hết hạn theo lô |

"Crash" được mô phỏng bằng `dropAllWithoutSaving()` (bỏ mọi object trong bộ nhớ, không lưu) rồi `attach` lại từ DB.
