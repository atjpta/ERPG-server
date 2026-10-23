# Triển khai: 1 hoặc N process

Server chạy được trên **1 process** (VPS 1 CPU) lẫn **N process** (nhiều CPU / nhiều máy). Cùng một code, chỉ khác cấu hình.

## Hai vai trò

| Vai trò (`PROCESS_ROLES`) | Chạy gì                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `global`                  | Global room của từng game server: chat, party, bạn bè, thư, túi đồ + **dữ liệu chính của người chơi online** |
| `world`                   | Room map / dungeon (tick, di chuyển, quái, combat)                                                           |

Mặc định (không đặt) = `global,world` → một process làm cả hai, **không cần Redis**.

World ở process khác global nói chuyện qua `rooms/bus` (Colyseus `remoteRoomCall`, cần Redis presence). Chi tiết cơ chế: [room-interactions.md](room-interactions.md).

Chỉ có **một đường chạy** cho 1 hay N process: world luôn dùng bản sao dữ liệu player (`PlayerStateManager`) và nói chuyện với global qua bus, kể cả khi cùng process. Vì vậy đổi từ 1 sang N process không đổi hành vi, và 1 process không cần Redis.

## 1 process (VPS 1 CPU)

```bash
dotenvx run -f .env.production -- node build/index.js      # hoặc: yarn start
```

Không cần `REDIS_URI`. Đo trên máy dev: khoảng 20% một lõi cho mỗi 100 người chơi (bot di chuyển, chưa có combat), nên 1 lõi đầy ở khoảng 450-500 người; đặt trần an toàn ~50-60% CPU (khoảng 250-300 người) và **chia đôi** nếu VPS yếu hơn máy dev. Đo lại trên VPS thật bằng `SERVER_URL=http://<ip>:2567 yarn load-test` chạy từ máy khác.

## N process

Dùng launcher `scripts/cluster.mjs`:

```bash
# cần REDIS_URI; PORT là port của process đầu, các process sau +1
CLUSTER_PROCESSES=3 PORT=2567 \
CLUSTER_PUBLIC_ADDRESS='https://game.example.com/p{port}' \
dotenvx run -f .env.production -- node scripts/cluster.mjs   # hoặc: yarn start:cluster
```

| Biến                          | Ý nghĩa                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `CLUSTER_PROCESSES`           | Số process. Mặc định = số CPU. `1` = một process làm cả hai vai trò                            |
| `PORT`                        | Port process 0 (mặc định 2567); process i dùng `PORT + i`                                      |
| `CLUSTER_PUBLIC_ADDRESS`      | Địa chỉ công khai của mỗi process, có `{port}`. Truyền thành `PUBLIC_ADDRESS` cho từng process |
| `REDIS_URI`                   | Bắt buộc khi N > 1 (presence, driver, cache dùng chung)                                        |
| `CLUSTER_SHUTDOWN_TIMEOUT_MS` | Chờ mỗi process tắt (mặc định 30000)                                                           |

Kế hoạch: process 0 chạy `global,world` (giữ global của mọi game server và một phần world), các process còn lại chạy `world`. Hai chế độ cùng tồn tại: world của process 0 dùng chung dữ liệu, world của các process khác dùng bản sao. Xem kế hoạch mà không chạy: thêm `--dry-run`.

Launcher tự khởi động lại process chết (tối đa 5 lần trong 60 giây) và khi tắt (SIGINT/SIGTERM) dừng **các process `world` trước** để chúng gửi bản sao lần cuối lên global, rồi mới tới process 0.

Dev: `yarn dev:cluster` (chạy từ `src` bằng tsx, đọc `.env.development`).

## Reverse proxy (Nginx)

Mỗi process quảng bá địa chỉ `https://game.example.com/p<port>`, client kết nối room theo địa chỉ đó. Proxy chuyển `/p<port>/...` về đúng process (bỏ tiền tố) và các request còn lại (đăng nhập, matchmaking, `/health`) chia đều:

```nginx
upstream erpg_pool { server 127.0.0.1:2567; server 127.0.0.1:2568; server 127.0.0.1:2569; }
map $http_upgrade $connection_upgrade { default upgrade; '' close; }

server {
    listen 443 ssl;
    server_name game.example.com;

    # Chỉ cho các port của cụm (đừng để lộ port bất kỳ).
    location ~ ^/p(?<port>256[7-9])/(?<rest>.*)$ {
        proxy_pass http://127.0.0.1:$port/$rest$is_args$args;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }

    location / {
        proxy_pass http://erpg_pool;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Đặt `TRUST_PROXY=true` khi chạy sau proxy.

## Giới hạn và lưu ý

- Mỗi game server có **đúng một global room** (chạy trên một process): đây là trần số người của một server. Thêm sức cho world bằng thêm process `world`; cho global thì thêm game server.
- Ghi chú vận hành: dữ liệu tiến độ và vị trí của người chơi ở world khác process được sao lưu lên global mỗi `player_config.autosaveSeconds` (30 giây, lệch nhau giữa các người) và ngay khi đổi map / rời room; process world chết bất ngờ mất tối đa chừng đó. Global chưa tự dọn trạng thái "đang ở world" khi process world chết.
- **Chưa kiểm chứng với Redis thật**: logic bản sao / global chạy qua test tích hợp và smoke (1 process, đi qua bus cục bộ); đường `remoteRoomCall` qua IPC, định tuyến `/p<port>` của proxy và báo vai trò qua Redis chưa chạy thật. Thử trên môi trường có Redis trước khi dùng thật.
