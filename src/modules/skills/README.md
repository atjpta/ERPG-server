# Skills module

Module lưu catalog skill trong PostgreSQL; `SkillService.setCacheData()` nạp chúng vào cache theo `code`. Mỗi skill gắn với `ownerType` và `ownerCode` (ví dụ monster `orc` hoặc class `swordsman`).

Mỗi skill có `castRange`; `skillHitEvents` mô tả nhiều lần đánh, mỗi event có `triggerTicks` (số tick tính từ lúc bắt đầu đánh), hitbox và `range` riêng (đơn vị tile). Giá trị seed được tác giả theo nhịp 20 tick/giây (50 ms/tick), sau đó server quy đổi sang tick mô phỏng 40 Hz. `levelConfig` và `effects` lưu hệ số theo cấp.

Hiện dữ liệu được quản lý bằng seed. `SkillSeed` tạo đòn đánh thường (`basicAttack`) của 3 class khởi đầu, canh theo anim `Assets/ERPG/Animation/PackCharacters/<Class>`:

| Class     | Skill                                                             | Cách gây damage                                                                 |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Swordsman | `swordsman_basic_attack` (MELEE)                                  | HITBOX: 1 nhát chém ở frame 3, `animationMs` 300                                |
| Archer    | `archer_basic_attack` (PROJECTILE)                                | Mũi tên rời cung ở 500 ms, bay 12 ô/s, tối đa 6 ô, trúng con đầu tiên (DESTROY) |
| Cleric    | `cleric_basic_attack` (GROUND, sát thương phép theo MAGIC_ATTACK) | Vùng tròn bán kính 0.6 đặt ở chân mục tiêu lúc 350 ms, nổ sau 150 ms            |

Cùng với `{monster}_attack` của monster. Mỗi class chỉ có 1 đòn đánh thường (clip anim tên `basic_attack`); đòn thêm sẽ bổ sung sau. Skill cũ (`swordsman_slash_*`, `swordsman_attack_*`, `swordman_slash`, `archer_attack`, `cleric_attack`) bị xoá khi seed chạy.

### Cách gây damage của hit event (`delivery`)

- `HITBOX` (mặc định): vùng `shape` quanh người đánh (gốc đúng vị trí người đánh, không có offset), gây damage ngay tại `triggerTicks`.
- `PROJECTILE` + `projectile { speed, maxDistance, radius, hitBehavior, maxHits }`: tại `triggerTicks` sinh một viên đạn ngay vị trí người đánh, bay thẳng về giữa hitbox mục tiêu đang chọn (không có → theo hướng mặt). Mỗi tick đạn bay một đoạn (quét từng bước ≤ 0.1 ô), trúng khi thân đạn (tròn `radius`) chạm hitbox; DESTROY biến mất ở mục tiêu đầu tiên, PIERCE xuyên tới `maxHits` mục tiêu.
- `AREA` + `area { delayMs, untargetedDistance }`: tại `triggerTicks` đặt vùng (`shape`/`radius` của event) đúng vị trí (x, y) của mục tiêu, kéo về trong `castRange`; không có mục tiêu → cách `untargetedDistance` ô trước mặt. Sau `delayMs` gây damage cho mọi mục tiêu chạm vùng.
- Hình `ELLIPSE` (mọi `delivery`): `width` = đường kính theo hướng đánh (X), `height` = đường kính theo trục dọc (Y), tâm đúng gốc của hit event — dùng cho vùng dẹt kiểu top-down. Server tính ở `skill-hitbox.world.util.ts`, client ở `SkillHitboxWorldUtil.cs` (cùng công thức).

Room xử lý ở `src/rooms/world/modules/combat/services/skill-delivery.world.service.ts`; đạn và vùng nằm trong world state (`projectiles`, `areas`) để client vẽ, bị xoá khi hết. Player đánh monster luôn theo vị trí monster mà client đó đang vẽ (`rewind.lastSeenBy`), kể cả với đạn đang bay. Bên đánh là player hay monster đều dùng chung (`SkillOwner`), nên monster đánh xa có thể chuyển sang PROJECTILE/AREA chỉ bằng dữ liệu.

## Dữ liệu cho client

Client không giữ bản copy tay nào của skill. `yarn seed` (bước cuối) và `yarn config:export` đọc skill đang bật trong DB rồi ghi `skills.json` vào thư mục truyền làm tham số trong `package.json` (hiện là `../ERPG/Assets/ERPG/Resources/Config`, giống `schema:generate`; bỏ qua nếu thư mục không tồn tại) — xem `src/seeds/client-config.export.ts`. Giá trị trong file đã quy đổi sẵn như server dùng: `triggerTicks`/`durationTicks` theo tick mô phỏng 40 Hz, damage = `damageBase + attack × damageAttackScaling`. File còn có `basicAttack`, `delivery`, `projectile` và `area` (`delayTicks` đã quy đổi). Client đọc qua `SkillConfigs` (predict thời lượng đòn, dự đoán hit, vẽ hitbox, tự bay đạn / đặt vùng của chính mình). Hình đạn / hiệu ứng vùng là prefab `Resources/SkillEffects/<skill code>` bên client.

Sửa skill → `yarn seed --force` (hoặc sửa DB rồi `yarn config:export`) → commit `skills.json` bên client cùng lúc với server.

Hit cuối phải nằm cách lúc kết thúc đòn ít nhất 150 ms (`HIT_CONFIRM_BUDGET_MS`): client chạy anim ngay lúc bấm, sát thương về sau khoảng 1 RTT, nên khoảng này giúp sát thương hiện ra trước khi anim xong mà không cần cho hit nổ sớm hơn frame chém. Với AREA tính tới lúc nổ (`triggerTicks` + `delayMs`); đạn còn phải bay nên không tính được. `SkillService` cảnh báo khi skill vi phạm, trừ skill `TargetType.TARGET` (đạn bay / vùng chờ nổ nên trúng sau anim là bình thường). Dùng `yarn seed --force` để cập nhật mốc hit trong database hiện có.

Chạy `yarn db:migrate` rồi `yarn seed` để tạo schema và thêm skill. Dùng `yarn seed --force` để ghi đè các giá trị seed hiện có.

## Skill của player / monster

`player_states.skills` và `monsters.skills` là jsonb `[{ skillId, level }]` (`OwnedSkill`). Các skill `basicAttack`, theo đúng thứ tự trong mảng, là combo đánh thường (`skillService.getBasicAttackCombo`): mỗi class hiện có 1 đòn (thêm skill `basicAttack` vào danh sách là thành combo); monster dùng skill đầu tiên. Player mới nhận skill mặc định của class (`classes.skills`); vì chưa có học skill, `ClassSeed` gán lại bộ này cho mọi player của class đang có bộ khác (`PlayerStateRepo.replaceClassSkills`). Danh sách này được gửi xuống client qua world state (`OwnedSkillState`), client tra `skills.json` theo `skillId`. `level` đã lưu nhưng chưa dùng để tính damage.

## Skill chủ động

Skill không thuộc combo đánh thường (`basicAttack: false`), không phải `DASH` / `PASSIVE` là skill chủ động (`skillService.getActiveSkills`, đúng thứ tự trong `skills` của player). Slot theo thứ tự trong `skills` của class (phím Z, C, V; mỗi slot một nút trên mobile): Swordsman `swordsman_cross_slash`, `swordsman_slash_dash`, `swordsman_fly_slash`; Archer `archer_piercing_arrow` (slot 1, đạn PIERCE xuyên mọi mục tiêu trên đường bay), `archer_knockback_shot` (slot 2, đẩy lùi), `archer_rain_arrows` (slot 3, vùng mưa tên AREA — prefab dùng ParticleSystem chỉnh ở Inspector); Cleric `cleric_buff_hp` (slot 1), `cleric_fireball` (slot 2), `cleric_explosion` (slot 3, niệm `castTimeMs` rồi nổ ở chỗ mục tiêu). Thêm slot mới = thêm `skillNCooldownTicks` + trigger `SkillN` + phím/nút ở client.

- Input: `MoveWorldInput.skill` = số thứ tự skill (từ 1), 0 = không; chỉ có hiệu lực đúng tick đó, không có buffer. Skill được ưu tiên hơn đòn đánh thường và dùng tại chỗ (không tự áp sát target).
- Điều kiện (`PlayerAttackChain.startSkill`, client mirror ở `WorldMovementStep.cs`): hết đòn đang vung, `skillNCooldownTicks` của slot đó = 0, đủ `manaCost` (trừ ngay khi dùng).
- State: `castSlot` (skill đang vung, 0 = đòn đánh thường theo `attackCombo`), `skill1CooldownTicks` / `skill2CooldownTicks` (đếm từ lúc bắt đầu skill, sau `castTimeMs`, riêng với hồi đòn đánh thường). Đang vung (`animationMs`) hoặc lướt thì khoá mọi skill và đòn đánh thường; hết vung thì hồi đòn đánh thường (`cooldownMs`) chỉ chặn đòn đánh thường, còn hồi của một skill chủ động chỉ chặn chính skill đó. Client hiện cooldown ở đúng nút của skill, các nút khác chỉ bị khoá trong lúc vung.
- Hit event tác giả như đòn đánh thường: vùng RECT = bbox của sprite ở frame chém (pivot, 32 px = 1 tile), `triggerTicks` = frame × 50 ms / 50. Animator của class cần trigger `Skill1` dẫn tới state của skill.

### Skill lướt tới mục tiêu (charge)

Skill kiểu `DASH` khác `dash` thường (`isChargeSkill`, ví dụ `swordsman_slash_dash`) có 2 hành động. Bấm skill thì chưa ra đòn mà lướt với tốc độ dash (client hiện hiệu ứng dash như thường, không bất tử). Có mục tiêu đang chọn trong `castRange` thì lướt thẳng về phía nó (hướng chốt lúc bấm trong `aimX/aimY`), **xuyên qua và dừng ngay sau lưng nó** (quãng = khoảng cách tới mục tiêu + nửa collider hai bên theo hướng lướt, tối đa `freeDistance`); không có mục tiêu thì lướt **đủ `freeDistance` (mặc định cả `castRange`)** theo hướng đang đi (`PlayerAttackChain.stepCharge`, client mirror `WorldMovementStep.StepCharge`). Hết đoạn lướt thì quay mặt lại mục tiêu (nếu còn sống) rồi mới ra đòn: `animationMs` và `triggerTicks` của hit event tính từ lúc đó, anim của skill phát lúc đó.

- State: `charging` (đang lướt), `chargeTargetId` (mục tiêu chốt lúc bấm), `attackCooldownTicks` đếm lùi thời gian lướt tối đa (đủ đi hết `castRange` + 10 tick, tối đa 255). Hết giờ, mục tiêu chết hoặc dash thường cắt thì dừng, không ra đòn.
- Mỗi step dời tối đa `tốc độ × dt` về phía điểm gần nhất của collider mục tiêu, không vượt quãng còn lại, nên dừng sát mà không lấn (`applyDirectedMove` xử lý địa hình như di chuyển thường).
- Không có mục tiêu (hoặc mục tiêu ngoài `castRange`) thì vẫn dùng được như dash: lướt theo hướng đang đi (8 hướng như dash; không giữ cần thì theo hướng đang quay), dài `chargeConfig.freeDistance` (`chargeTargetId` rỗng, `attackCooldownTicks` đếm lùi số tick đó), hết đoạn lướt thì ra đòn ở chỗ đứng.
- Cooldown đếm từ lúc bấm (gồm cả thời gian lướt). Mana trừ lúc bấm.

### Skill buff vùng (AURA)

Hit event `delivery: AURA` (hiện chưa skill nào dùng; trước đây là `cleric_aura_buff`) không phải một cú đánh: bấm skill là vùng elip bắt đầu ngay (`SkillDeliveryWorldService.startAura`, `triggerTicks` bỏ qua), bám theo người dùng và tồn tại `aura.durationMs` (cộng `durationMsPerLevel` mỗi level). Mỗi `aura.tickMs` người dùng và đồng đội cùng party (`partyRoomId`) đứng trong vùng được hồi `healScaling × MAGIC_ATTACK` (client hiện "+N" qua message `potionUsed`), quái trong vùng chịu `damageScaling × MAGIC_ATTACK` (phép).

- **Level:** nửa trục vùng = `radiusX/Y × (1 + radiusScalePerLevel × (level − 1))`, level lấy từ `OwnedSkillState.level`. State `auras` gửi bán kính đã tính theo level; client phóng prefab `Resources/Prefabs/SkillEffects/<code>` theo `radius hiện tại / radiusX gốc`, nên `radiusX/Y` ở level 1 phải khớp prefab ở scale gốc (ví dụ prefab aura cũ: sprite 1.47 ô × scale 3 → nửa trục 2.2, xoay 75° nên nửa trục dọc 2.2 × cos 75° ≈ 0.57).
- **Hồi chiêu chỉ chạy sau khi buff hết:** `getSkillCooldownTicks` cộng sẵn thời gian buff ở level đó vào hồi chiêu lúc bấm (client `SkillConfig.StartCooldownTicks` tính y hệt); HUD trừ phần buff còn lại đi nên nút không hiện đếm ngược trong lúc buff, chỉ bị khoá. Buff bị cắt sớm (chủ chết / rời room) thì `removeAura` đặt lại hồi chiêu về đúng `cooldownMs`.
- Hit event AURA không nằm trong lịch hit (`buildPendingSkillHits` bỏ qua nó) và client không dự đoán gì cho nó — vùng đến từ server.

### Skill hồi đồng đội (ALLIES)

Hit event `delivery: ALLIES` (ví dụ `cleric_buff_hp`) giao ở `triggerTicks` như một cú đánh thường nhưng không gây damage: hồi `allies.healBase + allies.healScaling × MAGIC_ATTACK` cho người dùng và đồng đội cùng party (`partyRoomId`) đứng trong vùng elip `allies.radiusX/Y` quanh người dùng. Mỗi người được hồi nhận "+N" trên đầu (message `potionUsed`) — kể cả khi đã đầy máu, để thấy skill đã trúng — và server báo `skillEffect` `{ skillId, sessionIds }` để client gắn prefab `Resources/Prefabs/SkillEffects/<code>` lên từng người đó (prefab cùng pivot với nhân vật, chạy một lượt anim rồi tự xoá). Client không dự đoán gì cho hit này.

### Tầm dùng skill, đòn nhiều hướng, choáng

- **Đủ tầm mới dùng skill, chưa đủ thì đi lại gần:** đang chọn target (`targetId`) mà target xa hơn `castRange` của skill (tâm tới tâm) thì nhân vật tự đi về phía target (cùng deadzone/8 hướng với áp sát đòn đánh thường, `getSkillApproachMove`) rồi dùng skill ngay tick đầu vào tầm; client giữ `skill` như mức (level) cho tới khi skill bắt đầu, thả stick ngược hướng target thì huỷ. Không chọn target, hoặc skill tự thân (`castRange` 0), thì dùng tại chỗ (`isTargetOutOfRange`, client mirror `WorldMovementStep.TryGetSkillApproach`). Skill lướt (`chargeConfig`) lướt tới target khi đã vào tầm, hoặc lướt thẳng khi không chọn target — **full `castRange`** (`chargeConfig.freeDistance` chỉ để thu ngắn lại).
- **Đòn nhiều hướng (`aimed: true` trên hit event HITBOX):** vùng đánh xoay theo hướng ngắm — về giữa hitbox target đang chọn, không có thì theo hướng mặt — thay vì chỉ trái / phải. Hướng chốt lúc bắt đầu skill, lưu ở `PlayerWorldState.aimX/aimY` (skill không `aimed` ghi hướng mặt); hit đang chờ mang theo `aim`, `intersectsSkillHitEvent` dùng vector đó làm trục dọc (trục ngang vuông góc), và client xoay hiệu ứng `SkillEffect` của nhân vật theo cùng hướng (bên trái được lật gương thay vì lộn ngược).
- **Choáng:** effect `APPLY_STATUS` + `crowdControlType: STUN` + `durationMs` trên hit event (seed: `stunMs`). Chỉ áp khi hit trúng và monster còn sống (`applySkillHit` → `MonsterWorldState.stun`): `stunTicks` đồng bộ xuống client; `MonsterStunChain` bỏ qua mọi hành vi của monster (không tìm mục tiêu, không đi, đòn đang vung bị huỷ) cho tới hết choáng. Client giữ nguyên anim đang chạy (`animator.speed = 0`) và về idle khi hết choáng. Choáng không cộng dồn, lấy lần dài hơn.
- **Đẩy lùi:** effect `KNOCKBACK` trên hit event (seed: `knockback: { distance, durationMs }`; `baseValue` = quãng ô, `durationMs` = thời gian đẩy). Chỉ áp khi hit trúng và monster còn sống (`applySkillHit` → `MonsterWorldState.knockback`): đẩy ra xa người đánh theo đường nối hai bên, `MonsterStunChain` dời vị trí đều mỗi tick (`applyDirectedMove`, tôn trọng bản đồ / địa hình) và monster choáng suốt lúc bị đẩy. Vị trí đồng bộ qua `x/y` như bình thường nên client không cần code riêng.
- **Vùng kéo dài (AREA):** `area.durationMs` + `area.tickMs` (mặc định 1000): vùng tồn tại `durationMs` từ lúc đặt, gây damage lần đầu sau `delayMs` rồi lặp mỗi `tickMs` (số lần = `floor((durationMs − delayMs) / tickMs) + 1`, mỗi lần roll riêng). Thiếu `durationMs` = một lần như cũ. Client đọc `pulseTicks` / `pulses` từ `skills.json`; prefab (ParticleSystem loop) bị dừng phát và xoá khi vùng hết (entry rời `areas`). Ví dụ `archer_rain_arrows`.
