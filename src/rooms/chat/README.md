# Chat room

Một chat room cho mỗi `serverId` (`joinOrCreate("chat", { serverId })`, `serverId` phải khớp token). Chạy song song với
world room, nên không bị đá khi đăng nhập trùng ở room khác (vẫn bị đá khi ban/xoá/logout).

Không dùng Colyseus Schema state: chat là sự kiện. Mọi thứ gửi xuống là `Result` — tin mới `received`, lịch sử
`history`, lỗi gửi `sendResult`.

## Kênh

| Kênh      | Người nhận                                                | Lưu DB (mặc định) |
| --------- | --------------------------------------------------------- | ----------------- |
| `world`   | mọi người trong chat room của server                      | có                |
| `general` | người cùng world room (RPC `ChatListPlayersWorldCommand`) | không             |
| `party`   | thành viên party (RPC `ListMembersPartyCommand`)          | không             |
| `whisper` | người nhận theo tên + echo về người gửi                   | có                |

Bật/tắt, độ dài, rate limit, lưu DB, số tin lịch sử khi vào đều nằm ở master data `chat_config.channels[key]`.

## Luồng gửi tin

`send-<kênh>.chat.command.ts` (kế thừa `SendChatCommand`) → `ChatDeliveryService.send`:
kênh bật? → rỗng / quá dài → rate limit → `ChatChannel.resolveRecipients` → gửi `received` → lưu `chat_messages`
nếu kênh bật `saveHistory` (không chặn việc gửi).

## Thêm kênh mới (vd `guild`, `trade`)

1. Thêm member vào `ChatChannelKey` (`src/modules/chat/enums/chat-channel-key.enum.ts`).
2. Viết `modules/channels/<key>.chat.channel.ts` (implement `ChatChannel`: chỉ trả lời "ai nhận") và thêm vào
   `chat-channel.registry.ts`. Kênh có lịch sử riêng thì thêm `loadHistory`.
3. Thêm key client vào `ChatClientMessage` và command mỏng `modules/messages/commands/send-<key>.chat.command.ts`
   (copy `send-general.chat.command.ts`: `message`, `validateSchema`, `channelKey`).
4. Thêm mục `<key>` vào `chat_config.channels` (seed trong `master-data.seed.ts`; DB đã seed thì sửa qua admin).
5. Thêm `ChatErrorCode` nếu có lỗi riêng, rồi `yarn unity:network`.

Không cần sửa room hay DTO (`ChatReceivedMessage` dùng chung). Vì `channel` là pg enum nên member mới ở bước 1 cần `yarn db:generate && yarn db:migrate`.

## Lịch sử và loadmore

Kênh bật `saveHistory` có lịch sử. Vào room server gửi sẵn trang mới nhất (`historyOnJoin` tin); muốn tải thêm, client gửi
`getHistory { channel, before }` với `before` là `id` của tin cũ nhất đang hiện, server trả `historyPageSize` tin cũ hơn kèm
`hasMore`. Con trỏ là `id` (uuid v7, tăng theo thời gian, duy nhất) nên không sót / lặp tin ở ranh giới trang. `id` được sinh
ngay lúc gửi và dùng chung cho tin realtime (`received`) và dòng DB, client dùng nó để khử trùng.

## Dọn lịch sử cũ (chưa làm)

Việc xoá tin cũ hơn `chat_config.retentionDays` sẽ làm bằng job riêng, không chạy trong chat room (room tự dispose khi
vắng người và mỗi server một room nên dễ dọn lặp / không dọn). Hàm sẵn để job gọi: `chatMessageService.purgeOlderThan`.
