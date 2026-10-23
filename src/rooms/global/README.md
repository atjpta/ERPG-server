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

## Dungeon

`LaunchDungeonGlobalCommand` (RPC từ world khi chủ vào dungeon hoặc "đi lại"): tạo party 1 người nếu chủ chưa có, kiểm tra
nhóm, hỏi world room của từng thành viên (`PartyCheckDungeonWorldCommand`), ghi `dungeonExpectationService`, rồi ra lệnh
`PartyEnterDungeonWorldCommand`. Không phải giao dịch nguyên tử; thất bại giữa chừng được báo cho cả party.
