# Test tích hợp

Chạy trên DB dev (đã `yarn db:migrate && yarn seed`), **không cần server đang chạy**:

```bash
yarn test:integration                 # tất cả
yarn test:integration friend          # một bộ: friend | mail | giftcode | npcfunction | runtime
yarn test:integration mail inbox      # lọc theo tên bài
```

Mỗi bài tự tạo user / player tạm (`fixtures.ts`, `createStates` thêm `player_states`) và xoá khi xong. Bộ test dùng service của `modules/*` (và `PlayerStateManager`) trực tiếp, nên bắt được lỗi đồng thời và lỗi giữa chừng mà
`yarn smoke` (một client, tuần tự) không bắt được.

| File                         | Kiểm chứng                                                                                                                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `friend-concurrency.test.ts` | accept / decline / cancel đồng thời (chỉ một bên thắng, DB khớp kết quả báo); giới hạn bạn / lời mời / chặn không bị vượt khi nhiều yêu cầu cùng lúc; lời mời đang chạy không tạo lại quan hệ sau khi bị chặn                       |
| `player-runtime.test.ts`     | `PlayerStateManager`: attach / detach theo bên dùng, `transact` (lưu ngay, rollback, `TransactAbort`, đồng thời), `mutate` (autosave chỉ ghi nhóm đổi, lưu sớm, phát lại khi trùng `transact`), gộp khi DB bị ghi từ ngoài, "crash" |
| `gift-code.test.ts`          | nhập code đúng / sai / tắt / sai server / chưa bắt đầu / hết hạn; cùng nhân vật nhập đồng thời chỉ nhận một thư; `maxUses` không bị vượt khi nhiều nhân vật nhập cùng lúc và người thua không để lại biên nhận                      |
| `npc-function.test.ts`       | chức năng NPC (cường hoá / tinh hoá / phân rã): chưa mở → `NPC_FUNCTION_NOT_OPEN`, sai loại bị từ chối, ra ngoài tầm → `TOO_FAR` rồi đóng, tick đóng người đi xa / rời room, mở chức năng khác thay cái cũ                          |
| `mail-transfer.test.ts`      | gửi / nhận / COD / thu hồi trong MỘT transaction cùng ví người chơi: không mất, không nhân đôi tiền; thu hồi đua với nhận chỉ một bên thắng; hộp thư không vượt `maxInbox` khi gửi đồng thời; dọn thư và lời mời hết hạn theo lô    |

"Crash" được mô phỏng bằng `dropAllWithoutSaving()` (bỏ mọi object trong bộ nhớ, không lưu) rồi `attach` lại từ DB.
