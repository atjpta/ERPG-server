# Global room

Một global room cho mỗi `serverId` (`joinOrCreate("global", { serverId })`, `serverId` phải khớp token). Client giữ kết nối
này suốt phiên chơi, song song với world room. Có `GlobalState` (Schema) nhưng không field nào `@type` nên không đồng bộ gì cho client: mọi thứ là Request/Response
(`room.Request<T>` nhận `Result`) hoặc thông báo server đẩy (`GlobalMessage`).

```text
global/
  global.room.ts            # Room: reconnect 20s, RPC runner, state.players (PlayerDataState: PlayerData + name + presence) / parties
  global.shared.ts          # Public cho world: DTO, enum, command RPC, dungeonExpectationService
  commands/                 # OnCreate / OnJoin / OnLeave, PlayerGlobalCommand
  types/                    # GlobalClientMessage / GlobalMessage + DTO, mã lỗi party / chat
  modules/
    chat/                   # 4 kênh world / general / party / whisper, lịch sử DB
    party/                  # schemas/ PartiesState + PartyState (luật, lời mời), loot
    mail/                   # Hộp thư: thư hệ thống đa ngôn ngữ, thư người chơi (đính kèm, COD, thu hồi), broadcast, dọn hết hạn
    friend/                 # Bạn bè: lời mời, danh sách, presence, chặn (schemas/ FriendsState = id bạn của người đang online)
    dungeon-launch/         # LaunchDungeon (điều phối cả party vào dungeon), dungeon expectation
    player-data/            # PlayerData: state + lưu DB + RPC ApplyPlayerChanges / SyncPlayers (xem mục PlayerData)
    inventory/              # Túi đồ: equip / unequip / move / lock, InventoryGlobalCommand, inventoryGlobalService
    equipment-upgrade/      # Cường hoá, tinh hoá, phân rã và các lệnh xem trước
    attributes/             # Xem trước / cộng điểm thuộc tính
    world-registry/         # Sổ đăng ký player → world room / map / instance: AttachWorld / DetachWorld / HeartbeatWorld, dọn vị trí quá hạn
```

Đăng nhập trùng: một player một kết nối global, kết nối cũ bị thay (`DUPLICATE_LOGIN`); world room vào lúc đổi map
không đá global (`shouldKickFor` bỏ qua `DUPLICATE_LOGIN`), ban / xoá / logout vẫn đá.

## Sổ đăng ký world room (`world-registry`)

Module `world-registry/`: sổ đăng ký là field của `PlayerDataState` (`worldRoomId`, `mapCode`, `instanceId`, `seenAt`) và hàm xử lý
nằm trong `WorldRegistryGlobalService` (`worldRoomOf`, `isInWorld`, `attachWorld`, `detachWorld`, `refreshWorld`, `pruneStaleWorld`, `playersOnSameMap`). World
room báo lên bằng RPC `AttachWorld` (vào room), `DetachWorld` (rời), `HeartbeatWorld` (~30s, làm mới); các command này nằm trong
`modules/world-registry/commands/`. Global không có bản sao của world: level / HP / ví không được báo lên, chỗ nào cần thì kéo trực tiếp
từ world (`fetchWorld`). Vị trí không được làm mới 90s bị dọn.

## Party

Party là logic trong global (`PartiesState`: `partyId -> PartyState`, `playerId -> partyId`), không phải Colyseus room.
Người chơi là thành viên từ lúc tạo / nhận lời mời đến khi rời, bị đá, giải tán hoặc kết nối global kết thúc (sau
thời gian chờ reconnect). Client nhận trạng thái bằng push `partyState` (snapshot đầy đủ) sau mỗi thay đổi,
`partyLeft` khi không còn ở party, `partyNotice`, `partyInviteReceived`, `partyJoinRequest`, `partyDungeonDenied`.
Global báo world room của từng thành viên (`PartySetPlayerPartyWorldCommand`) để world biết party / cách chia loot.

Chia thưởng hạ quái do world tự tính (`shareKillReward`, dùng `lootMode` global đã đẩy xuống), không gọi RPC lên global; con trỏ luân phiên nằm ở world theo từng (room, party).

## PlayerData

`modules/player-data/` là nơi **làm chủ** dữ liệu ít đổi của nhân vật: 3 túi đồ, `equipments`, `attribute_points`, `skill_points`,
`allocated_attributes` (+ stats dẫn xuất tính từ chúng). `GlobalState.players` (`Map<playerId, PlayerDataState>`, server-only; mỗi `PlayerDataState` cũng giữ `name` và presence (`worldRoomId`, `mapCode`, `instanceId`) của người đó) nạp
`PlayerDataState` từ DB khi cần và dọn khi người chơi không còn kết nối global lẫn vị trí world. Phần còn lại của
`player_states` (vị trí, HP/MP, level/exp, **ví**, quest, cờ) do world làm chủ; global không giữ bản sao, cần level / ví thì kéo trực tiếp từ world.

- Mọi thao tác túi / thuộc tính từ client là request của global (`equipItem`, `unequipItem`, `moveItem`, `lockItem`, `enhanceEquipment`,
  `refineEquipment`, `disassembleItems`, `preview*`, `updateAttributes`); push `inventory`, `attributes`, `inventoryFull`...
  cũng từ global. Mỗi thao tác chạy trên bản làm việc (`workingCopy`), thành công thì `adopt` → **lưu DB ngay** (global là bên ghi
  DB duy nhất lúc đang chơi, chỉ cột của mình) → đẩy snapshot sang world (`PlayerDataChangedWorldCommand`) → gửi push cho client.
  Mọi thao tác của cùng một player chạy tuần tự (`exclusive`).
- Thao tác cần phần của world (mặc đồ cần level, cường hoá cần vàng) gọi `PullPlayerFieldsWorldCommand` trước; trừ vàng đi qua
  `DebitWalletWorldCommand` (world trừ nguyên tử, idempotent), lưu lỗi thì `CreditWalletWorldCommand` hoàn lại.
- RPC từ world: `SyncPlayersGlobalCommand` (backup phần world làm chủ — checkpoint 30s, rời room, đổi map; global lưu xuống DB, trả
  `revision`, kèm snapshot nếu world đang giữ bản cũ) và `ApplyPlayerChangesGlobalCommand` (`takeItem` / `giveItem` / `addPoints`,
  nguyên tử theo entry, idempotent theo `eventId` — dùng cho quest, thoại, thu thập, bình thuốc, item rơi, điểm lên level).
- Một `player_states.revision` cho cả bản ghi; world lưu `stateRevision`, nếu cũ hơn global thì nhận snapshot mới.

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
- `GlobalState.friends` (`FriendsState`) giữ id bạn của người đang kết nối global (nạp lúc `onJoin`, dọn lúc `onLeave`) để đẩy presence mà
  không query DB; `AttachWorld` cũng đẩy presence khi đổi map. Presence chỉ có online + `mapCode` (global không giữ level).
- Chặn: xoá luôn quan hệ bạn bè / lời mời; người bị chặn (và người chặn) không mời party hay nhắn riêng được — server trả
  "không tìm thấy" để không lộ việc bị chặn (`partyInvite`, `sendWhisper`, `friendRequest`).
- Xoá tài khoản: hai bảng có FK `onDelete: cascade` tới `players` nên `purgeUserData` (xoá player) dọn luôn.

## Đổi tên giữa phiên

`PUT /user/players/me/name` ghi DB rồi `playerRenameService.publish` (presence pub/sub, đi được qua nhiều process như kick). Mỗi room giữ người đó
subscribe trong `BasePlayerRoom` và override `onPlayerRenamed`: global đổi tên trong `PlayerDataState`, tên thành viên party (gửi lại `partyState`) và
báo bạn đang online bằng `friendChanged` `renamed`; world đổi `PlayerWorldState.name` (state đồng bộ nên mọi client cùng room thấy ngay). Thư đã gửi
giữ `senderName` cũ (bản chụp lúc gửi).

## Mail

Dữ liệu ở DB (`modules/mails`): `mails` (một dòng cho mỗi người nhận), `mail_templates` (mẫu thư hệ thống vi/en, seed `mail-template.seed.ts`),
`mail_broadcasts` (mẫu gửi cả server). Cấu hình ở master data `mail_config` (hạn, hộp thư tối đa, ngôn ngữ, số món đính kèm, rate limit, trần COD).
Đính kèm của MỌI thư (hệ thống, broadcast, người chơi) là một cột `reward` đúng kiểu `Reward` của quái rớt / quest (`MailRewardSchema`);
quái rớt / dungeon / quest / consumable vẫn cộng thẳng vào inventory, **không** đi qua mail (túi đầy thì phần dư mất như cũ).

- Thư hệ thống: `mailService.sendSystem` / `sendReward` (gửi từng người, ghi thẳng vào `mails`, người offline vẫn nhận, không tính `maxInbox`) và
  `sendBroadcast` (bảng riêng, phát lười khi người chơi gọi `mailList`; `skipNewPlayers`). "Đã phát" ghi ở `mail_broadcast_receipts`, không suy ra từ thư còn tồn tại — nếu không thì xoá thư là được phát lại và nhận quà lần nữa. Nội dung là mẫu thư (`templateCode` + `params`) hoặc
  `content` inline `{ vi: {...}, en: {...} }`; bắt buộc có `mail_config.defaultLocale`. Chưa có API admin: dev dùng `yarn mail:tool` (xem đầu `scripts/mail-tool.ts`).
- Ngôn ngữ: `mailList { locale }` — server chọn locale → `defaultLocale` → `en` → ngôn ngữ đầu tiên có, trả `locale` thực dùng, và nhớ locale
  (`GlobalState.mails`) để push `mailReceived` đúng ngôn ngữ. Thư người chơi giữ nguyên chữ người viết.
- Request: `mailList`, `mailRead`, `mailClaim`, `mailClaimAll` (bỏ qua COD), `mailReturn`, `mailSentList`, `mailRecall`, `mailDelete`, `mailDeleteRead`, `mailSend`.
  Push: `mailReceived`, `mailRemoved`.
- Gửi (`mailSend`): người chơi cùng server theo tên (offline vẫn nhận, người đã chặn mình → `MAIL_TARGET_NOT_FOUND`), đính kèm item (`instanceId` trong túi, món khoá
  không được) và vàng (trừ ở world qua `DebitWalletWorldCommand`, nên cần đang ở world); không có phí gửi. Rút item khỏi túi + ghi thư cùng một transaction
  (`playerDataGlobalService.save(..., dbOrTx)`); lỗi thì hoàn ví. `cod` = giá người nhận phải trả mới lấy được đính kèm (người gửi tự đặt, trần `maxCodAmount`).
- Nhận (`mailClaim`): túi phải còn chỗ (`INVENTORY_FULL`, thư giữ nguyên); tiền cộng qua `CreditWalletWorldCommand`; thư COD trừ giá của người nhận trước, rồi cùng
  transaction với lưu túi + đánh dấu đã nhận có điều kiện (`claimed_at IS NULL`) ghi thư hệ thống `cod_payment` (tiền về người gửi, offline cũng nhận).
  Mỗi lần thử dùng `eventId` ví mới (world nhớ `eventId` đã áp dụng nên dùng lại sau khi hoàn tiền sẽ bị bỏ qua).
- Thu hồi (`mailRecall`): người gửi lấy lại thư chưa được claim (đã đọc vẫn được), đính kèm về người gửi bằng thư hệ thống `mail_returned`; thắng / thua với `claim`
  do DB phân xử (cả hai là câu lệnh có điều kiện). `mailReturn` là người nhận từ chối; hết hạn cũng trả về người gửi (`SweepMailsGlobalCommand`, ~1 giờ/lần).
- Xoá tay (`mailDelete`): thư đã đọc và (không đính kèm hoặc đã nhận); COD chưa nhận phải nhận hoặc trả lại.
- Xoá tài khoản: `mails` có FK `onDelete: cascade` tới người nhận (người gửi bị xoá chỉ mất liên kết, `senderName` là bản chụp tên).

## Dungeon

`LaunchDungeonGlobalCommand` (RPC từ world khi chủ vào dungeon hoặc "đi lại"): tạo party 1 người nếu chủ chưa có, kiểm tra
nhóm, hỏi world room của từng thành viên (`PartyCheckDungeonWorldCommand`), ghi `dungeonExpectationService`, rồi ra lệnh
`PartyEnterDungeonWorldCommand`. Không phải giao dịch nguyên tử; thất bại giữa chừng được báo cho cả party.
