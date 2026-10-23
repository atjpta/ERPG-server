# Global room

Một global room cho mỗi `serverId` (`joinOrCreate("global", { serverId })`, `serverId` phải khớp token). Client giữ kết nối
này suốt phiên chơi, song song với world room. Room không có state Schema (không đồng bộ gì cho client): mọi thứ là Request/Response
(`room.Request<T>` nhận `Result`) hoặc thông báo server đẩy (`GlobalMessage`).

```text
global/
  global.room.ts            # Room: reconnect 20s, attach / detach PlayerRuntime, đăng ký sự kiện runtime (bagChanged / presenceChanged), state.parties / friends / mails

  commands/                 # OnCreate / OnJoin / OnLeave, PlayerGlobalCommand
  types/                    # GlobalClientMessage / GlobalMessage + DTO, mã lỗi party / chat
  modules/
    chat/                   # 4 kênh world / general / party / whisper, lịch sử DB
    party/                  # lệnh party, thông báo, lời mời hết hạn (dữ liệu + luật ở src/rooms/runtime/modules/party)
    mail/                   # Hộp thư: thư hệ thống đa ngôn ngữ, thư người chơi (đính kèm, COD, thu hồi), broadcast, dọn hết hạn
    friend/                 # Bạn bè: lời mời, danh sách, presence, chặn (id bạn của người đang online ở src/rooms/runtime/modules/friend)
    dungeon-launch/         # DungeonLaunchGlobalService (điều phối cả party vào dungeon; đăng ký cổng `launchDungeon` vào room.runtime)
    player-data/            # playerDataGlobalService: mutate (transact trên PlayerRuntime) + gửi inventory / attributes
    inventory/              # Túi đồ: equip / unequip / move / lock, InventoryGlobalCommand, inventoryGlobalService
    equipment-upgrade/      # Cường hoá, tinh hoá, phân rã và các lệnh xem trước
    attributes/             # Xem trước / cộng điểm thuộc tính
    world-registry/         # Tra cứu presence (player → world room / map / instance) từ PlayerRuntime
```

Đăng nhập trùng: một player một kết nối global, kết nối cũ bị thay (`DUPLICATE_LOGIN`); world room vào lúc đổi map
không đá global (`shouldKickFor` bỏ qua `DUPLICATE_LOGIN`), ban / xoá / logout vẫn đá.

## Presence (`world-registry`)

Ai đang ở world room nào là field `presence` của `PlayerRuntime` (`worldRoomId`, `mapCode`, `instanceId`) — world room ghi bằng
`room.runtime.players.setPresence` / `clearPresence` khi player vào / rời. `WorldRegistryGlobalService` chỉ là các phép tra cứu
(`worldRoomOf`, `isInWorld`, `playersOnSameMap`). `GlobalRoom` đăng ký sự kiện `presenceChanged`: có vị trí thì báo bạn bè
(`friendPresence`), mất vị trí mà không phải đổi map thì cho player rời party. Global không có bản sao dữ liệu của world: level / ví /
túi đọc thẳng từ `PlayerRuntime`.

## Party

Party là logic trong global (`room.runtime.parties` ở `src/rooms/runtime/modules/party`: `partyId -> PartyRuntime`, `playerId -> partyId`), không phải Colyseus room.
Người chơi là thành viên từ lúc tạo / nhận lời mời đến khi rời, bị đá, giải tán hoặc kết nối global kết thúc (sau
thời gian chờ reconnect). Client nhận trạng thái bằng push `partyState` (snapshot đầy đủ) sau mỗi thay đổi,
`partyLeft` khi không còn ở party, `partyNotice`, `partyInviteReceived`, `partyJoinRequest`, `partyDungeonDenied`.
Global ghi party của từng thành viên vào `PlayerRuntime.party` (`room.runtime.players.setParty`); world nhận sự kiện `partyChanged` để biết party / cách chia loot.

Chia thưởng hạ quái do world tự tính (`shareKillReward`, dùng `lootMode` trong `PlayerRuntime.party`); con trỏ luân phiên nằm ở world theo từng (room, party).

## Dữ liệu người chơi (`player-data`)

Túi đồ, trang bị, điểm, ví, level... đều nằm trong `PlayerRuntime` (`src/rooms/runtime/modules/player`) dùng chung với world — xem
[tương tác giữa các room](../../../docs/room-interactions.md). Global **không** giữ bản sao nào:

- Mọi thao tác túi / thuộc tính từ client là request của global (`equipItem`, `unequipItem`, `moveItem`, `lockItem`, `enhanceEquipment`,
  `refineEquipment`, `disassembleItems`, `preview*`, `updateAttributes`). Mỗi thao tác chạy trên **bản nháp** trong
  `playerDataGlobalService.mutate` (= `PlayerRuntimeService.transact`): lỗi nghiệp vụ → bỏ bản nháp; thành công → ghi `player_states` ngay
  rồi thay vào object thật. Thao tác cần ví / level (cường hoá tốn vàng, mặc đồ cần level) đọc và sửa thẳng `draft.wallet` / `draft.level`, nên
  "trừ vàng + đổi trang bị + lưu" là một khối — không còn trừ vàng nhờ world, hoàn tiền hay `eventId`.
- Cả túi (`inventory`) chỉ gửi MỘT lần lúc vào room. Sau đó khi runtime báo túi đổi (`bagChanged`, từ global hay từ world: nhặt đồ, thưởng quest...), global gửi **chi tiết thay đổi** `inventoryChanged` (ô thêm / đổi theo `id`, ô mất, slot đồ mặc đổi) tính bằng `InventoryDeltaGlobalService` (so với lần đã gửi), và `attributes` chỉ khi stats đổi. Gửi ngay nếu lâu chưa gửi, dồn dập thì gộp thành một lần trễ (≤ 200 ms). `bagGranted` báo `inventoryFull` / `inventoryNearlyFull`.
- Mọi thao tác của cùng một player chạy tuần tự (`exclusive` trong runtime).
- Lưu: `transact` ghi ngay; world tự lưu vị trí / tiến độ theo autosave (30 giây) và khi đổi map / rời room.

## Chat

Kênh nằm trong `modules/chat/channels`; gửi tin = request `sendWorld / sendGeneral / sendParty / sendWhisper`
(response `ok` hoặc `CHAT_*`), người nhận được push `chatReceived`. Lịch sử: request `getHistory { channel, before? }`
trả `ChatHistoryMessage` (không có `before` = trang mới nhất, cỡ `historyOnJoin`).
Bật/tắt, độ dài, rate limit, lưu DB nằm ở master data `chat_config.channels[key]`.

Thêm kênh mới (vd `guild`):

1. Thêm member vào `ChatChannelKey` (`src/modules/chat/enums/chat-channel-key.enum.ts`; pg enum nên cần `yarn db:generate && yarn db:migrate`).
2. Viết `modules/chat/channels/<key>.chat.channel.ts` (implement `ChatChannel`: chỉ trả lời "ai nhận") và thêm vào `chat-channel.registry.ts`.
3. Thêm key vào `GlobalClientMessage` và command mỏng `send-<key>.global.command.ts` (copy `send-general.global.command.ts`).
4. Thêm mục `<key>` vào `chat_config.channels` (seed `master-data.seed.ts`), thêm `ChatErrorCode` nếu có lỗi riêng, rồi `yarn unity:network`.

Việc xoá tin cũ hơn `chat_config.retentionDays` chưa làm (job riêng, `chatMessageService.purgeOlderThan`).

## Friend

Dữ liệu nằm DB (`modules/friends`: bảng `friendships` — một dòng cho mỗi cặp, `pending` → `accepted` — và `player_blocks`, một chiều),
chỉ trong cùng game server. Lời mời lưu DB nên người nhận offline vẫn thấy khi vào game (`friendList`); lời mời quá
`friend_config.requestTtlDays` coi như không tồn tại. Giới hạn (số bạn, lời mời, người chặn, rate limit) ở master data `friend_config`.

- Request: `friendList`, `friendRequest { playerName }`, `friendAccept` / `friendDecline` / `friendCancel` / `friendRemove` `{ playerId }`,
  `friendBlock { playerName }`, `friendUnblock { playerId }`. Hai người mời chéo nhau thì thành bạn luôn.
- Push: `friendChanged` (`added` / `removed` / `request_received` / `renamed`; `removed` dùng cho mọi trường hợp bỏ người đó khỏi danh sách),
  `friendPresence` (bạn online / offline / đổi map). Từ chối lời mời không báo người gửi.
- `room.runtime.friends` (`src/rooms/runtime/modules/friend`) giữ id bạn của người đang kết nối global (nạp lúc `onJoin`, dọn lúc `onLeave`) để đẩy presence mà
  không query DB; `presenceChanged` cũng đẩy presence khi đổi map. Presence chỉ có online + `mapCode` (global không giữ level).
- Chặn: xoá luôn quan hệ bạn bè / lời mời; người bị chặn (và người chặn) không mời party hay nhắn riêng được — server trả
  "không tìm thấy" để không lộ việc bị chặn (`partyInvite`, `sendWhisper`, `friendRequest`).
- Đồng thời: mọi thao tác "kiểm tra rồi ghi" (block, giới hạn số bạn / lời mời đã gửi / lời mời đang nhận / người chặn) chạy trong MỘT transaction giữ khoá tư vấn của các
  người chơi liên quan (`lockFriendPlayers`, theo thứ tự id nên không deadlock); accept / decline / cancel / remove là câu lệnh có điều kiện theo trạng thái nên chỉ một bên thắng
  và kết quả báo về luôn khớp DB. Lời mời hết hạn được dọn mỗi giờ (cùng `SweepMailsGlobalCommand`).
- Xoá tài khoản: hai bảng có FK `onDelete: cascade` tới `players` nên `purgeUserData` (xoá player) dọn luôn.

## Đổi tên giữa phiên

`PUT /user/players/me/name` ghi DB rồi `playerRenameService.publish` (presence pub/sub, đi được qua nhiều process như kick). Mỗi room giữ người đó
subscribe trong `BasePlayerRoom`; `AuthenticatedPlayerRoom.onPlayerRenamed` chỉ đổi tên **trong runtime** (`room.runtime.players.rename`, gọi lại cùng tên là no-op) và phát
`PlayerRuntimeEvent.RENAMED`. Mỗi room tự phản ứng: global cập nhật tên thành viên party (gửi lại `partyState`) và báo bạn đang online bằng `friendChanged` `renamed`;
world đổi `PlayerWorldState.name` (state đồng bộ nên mọi client cùng room thấy ngay). Thư đã gửi giữ `senderName` cũ (bản chụp lúc gửi).

## Mail

Dữ liệu ở DB (`modules/mails`): `mails` (một dòng cho mỗi người nhận), `mail_templates` (mẫu thư hệ thống vi/en, seed `mail-template.seed.ts`),
`mail_broadcasts` (mẫu gửi cả server). Cấu hình ở master data `mail_config` (hạn, hộp thư tối đa, ngôn ngữ, số món đính kèm, rate limit, trần COD).
Đính kèm của MỌI thư (hệ thống, broadcast, người chơi) là một cột `reward` đúng kiểu `Reward` của quái rớt / quest (`MailRewardSchema`);
quái rớt / dungeon / quest / consumable vẫn cộng thẳng vào inventory, **không** đi qua mail (túi đầy thì phần dư mất như cũ).

- Thư hệ thống: `mailService.sendSystem` / `sendReward` (gửi từng người, ghi thẳng vào `mails`, người offline vẫn nhận, không tính `maxInbox`) và
  `sendBroadcast` (bảng riêng, phát lười khi người chơi gọi `mailList`; `skipNewPlayers`). "Đã phát" ghi ở `mail_broadcast_receipts`, không suy ra từ thư còn tồn tại — nếu không thì xoá thư là được phát lại và nhận quà lần nữa. Nội dung là mẫu thư (`templateCode` + `params`) hoặc
  `content` inline `{ vi: {...}, en: {...} }`; bắt buộc có `mail_config.defaultLocale`. Chưa có API admin: dev dùng `yarn mail:tool` (xem đầu `scripts/mail-tool.ts`).
- Ngôn ngữ: server không chọn — thư hệ thống mang nội dung **mọi ngôn ngữ** trong `texts` (đã thay `{param}`), client tự lấy bản đúng ngôn ngữ của nó (và tự fallback). Thư người chơi dùng `subject` / `body` do người gửi viết.
- Request: `mailList`, `mailRead`, `mailClaim`, `mailClaimAll` (bỏ qua COD), `mailReturn`, `mailSentList`, `mailRecall`, `mailDelete`, `mailDeleteRead`, `mailSend`.
  Push: `mailReceived`, `mailRemoved`.
- Gửi (`mailSend`): người chơi cùng server theo tên (offline vẫn nhận, người đã chặn mình → `MAIL_TARGET_NOT_FOUND`), đính kèm item (`instanceId` trong túi, món khoá
  không được) và vàng / gem; không có phí gửi. `cod` = giá người nhận phải trả mới lấy được đính kèm (người gửi tự đặt, trần `maxCodAmount`).
  MỘT `transact` { rút đính kèm + trừ tiền người gửi (lưu `player_states`) + tạo thư (khoá hộp thư người nhận, kiểm tra `maxInbox`) }: lỗi ở
  bước nào thì rollback cả, không có trạng thái dở dang và không cần hoàn tiền.
- Nhận (`mailClaim`): MỘT `transact` { cộng đính kèm vào túi / ví người nhận, trừ giá COD nếu có, đánh dấu đã nhận **có điều kiện**, thư hệ thống
  `cod_payment` cho người gửi (offline cũng nhận) }. Túi hết chỗ → `INVENTORY_FULL`, không đủ tiền COD → `CURRENCY_NOT_ENOUGH`: thư giữ nguyên, thử lại được.
- Thu hồi (`mailRecall`): người gửi lấy lại thư chưa được claim (đã đọc vẫn được), đính kèm về người gửi bằng thư hệ thống `mail_returned`; thắng / thua với `claim`
  do DB phân xử (cả hai là câu lệnh có điều kiện trên cùng dòng thư; bên thua rollback, kể cả giá COD vừa trừ). `mailReturn` là người nhận từ chối; hết hạn cũng trả
  về người gửi (`MailTransferService`).
- Dọn dẹp (`SweepMailsGlobalCommand`, mỗi giờ và một lần ~5 giây sau khi room khởi tạo để làm bù sau restart): xoá thư hết hạn **theo lô** (200 thư/lô, tối đa 50 lô/lần,
  tồn đọng còn lại làm tiếp lần sau) và xoá lời mời kết bạn hết hạn (500/lô).

- Xoá tay (`mailDelete`): thư đã đọc và (không đính kèm hoặc đã nhận); COD chưa nhận phải nhận hoặc trả lại.
- Xoá tài khoản: `mails` có FK `onDelete: cascade` tới người nhận (người gửi bị xoá chỉ mất liên kết, `senderName` là bản chụp tên).

## Dungeon

`launchDungeon(serverId, request)` (cổng đăng ký vào `room.runtime` (`RoomRuntimeService` của game server), world gọi khi chủ vào dungeon hoặc "đi lại"; chạy `DungeonLaunchGlobalService`): tạo party
1 người nếu chủ chưa có, kiểm tra nhóm, hỏi world room của từng thành viên (`room.runtime.checkDungeonEntry`), ghi
`dungeonExpectationService`, rồi ra lệnh `enterDungeonInstance`. Không phải giao dịch nguyên tử; thất bại giữa chừng được báo cho cả party.
