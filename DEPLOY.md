# Deploy lên VPS — Docker + nginx

App chạy trong Docker, nginx reverse-proxy ra ngoài. Không dùng pm2. MongoDB dùng Atlas nên không cần container Mongo.

- Cổng trong container: **3000** · Cổng publish ra VPS: **3001**
- API docs: [docs/API-REFERENCE.md](docs/API-REFERENCE.md)

---

## 0. Trước tiên: commit và push

VPS lấy code bằng `git clone`, nên các file deploy phải có trên GitHub trước:

```bash
# Chạy ở MÁY LOCAL
git add Dockerfile docker-compose.yml .dockerignore .gitignore .env.example DEPLOY.md deploy/ .github/
git commit -m "chore: docker deploy setup"
git push origin master
```

Kiểm tra không có secret nào bị commit:

```bash
git ls-files | grep -E "\.p8$|^\.env$"     # phải không ra gì
```

---

## 1. Chuẩn bị VPS

```bash
# Docker (bỏ qua nếu VPS đã có)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# Xem RAM. Nếu Mem < 1GB và Swap = 0B thì tạo swap, không thì bỏ qua.
free -h
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Cổng 3001 phải rảnh (không ra gì là rảnh)
sudo ss -ltnp | grep :3001
```

Swap chỉ để `tsc` không hết RAM lúc build. App chạy không dùng swap.

Vào MongoDB Atlas → Network Access → thêm IP của VPS.

---

## 2. Clone và cấu hình

```bash
cd ~
git clone https://github.com/vgduchieu0602/Hurrican-BE.git soosky-storm-api
cd soosky-storm-api
mkdir -p secrets/apns

cp .env.example .env
nano .env
chmod 600 .env
```

Điền 6 giá trị:

```bash
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/soosky_storm?retryWrites=true&w=majority
OPENWEATHER_API_KEY=<key One Call 4.0>
APNS_TEAM_ID=<10 ký tự>
APNS_KEY_ID=<10 ký tự>
APNS_BUNDLE_ID=com.soosky.SooskyStormTracker
APNS_PRIVATE_KEY_PATH=/run/secrets/apns/AuthKey_XXXXXXXXXX.p8
```

Ba chỗ dễ sai:

| | |
| --- | --- |
| `MONGO_URI` | Phải có **tên database** trước dấu `?` (ví dụ `/soosky_storm`). Thiếu là dữ liệu vào database tên `test` |
| `APNS_PRIVATE_KEY_PATH` | Đường dẫn **trong container**, luôn bắt đầu `/run/secrets/apns/`. Không phải đường dẫn trên VPS |
| `HOST_PORT` | Chỉ sửa nếu 3001 đã bị chiếm |

Giá trị còn lại để nguyên.

---

## 3. Copy file `.p8` lên VPS

Chạy từ **máy local**:

```bash
scp AuthKey_XXXXXXXXXX.p8 user@vps:~/soosky-storm-api/secrets/apns/
ssh user@vps 'chmod 600 ~/soosky-storm-api/secrets/apns/*.p8'
```

Tên file phải khớp `APNS_PRIVATE_KEY_PATH` trong `.env`.

---

## 4. Build và chạy

```bash
cd ~/soosky-storm-api
docker compose up -d --build
docker compose logs -f api
```

Chờ 3 dòng:

```
Soosky Storm API running on http://0.0.0.0:3000
Mongo connected.
Storm alert detection every 900000 ms.
```

```bash
curl http://127.0.0.1:3001/health
# {"ok":true,"data":{"service":"soosky-storm-api","database":"connected"}}

docker compose ps        # STATUS phải là healthy sau ~20s
```

---

## 5. nginx + HTTPS

Domain: **project3.vuonghieu.site**

Trước tiên trỏ DNS: tạo record **A** cho `project3.vuonghieu.site` → IP của VPS. Kiểm tra đã trỏ đúng:

```bash
dig +short project3.vuonghieu.site      # phải ra IP VPS
```

File `deploy/nginx/storm-api.conf` đã điền sẵn domain này, chỉ cần copy:

```bash
cd ~/soosky-storm-api
sudo cp deploy/nginx/storm-api.conf /etc/nginx/sites-available/storm-api
sudo ln -s /etc/nginx/sites-available/storm-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Test HTTP trước khi lấy chứng chỉ:

```bash
curl -I http://project3.vuonghieu.site/health      # phải ra 200
```

Lấy HTTPS:

```bash
sudo certbot --nginx -d project3.vuonghieu.site
```

certbot tự thêm block `listen 443` + chứng chỉ vào file, và tự gia hạn. Xong:

```bash
curl -s https://project3.vuonghieu.site/health
```

Giữ `HTTP_TRUST_PROXY=1` trong `.env` vì có nginx phía trước.

Domain khác nhau thì nginx tự route theo `server_name`, không đụng các project khác đang chạy trên cùng VPS.

---

## 6. Kiểm tra

```bash
BASE=https://project3.vuonghieu.site

curl -s $BASE/health
curl -s "$BASE/v1/storms"
curl -s "$BASE/v1/weather/current?lat=10.8231&lon=106.6297"
curl -s -o /tmp/t.png -w "%{http_code} %{content_type}\n" "$BASE/v1/map-tiles/temperature/5/25/15"
curl -s "$BASE/v1/radar" | head -c 120
```

Đúng khi: `/health` có `"database":"connected"`, `/v1/weather/current` có `temperature`, map tile trả `200 image/png`.

---

## 7. Cập nhật code

```bash
cd ~/soosky-storm-api
git pull
docker compose up -d --build
docker image prune -f
```

Rollback:

```bash
git log --oneline -5
git checkout <commit_cũ>
docker compose up -d --build
```

---

## 8. Lệnh vận hành

```bash
docker compose ps
docker compose logs -f --tail=100 api
docker compose restart api
docker compose down
docker stats soosky-storm-api --no-stream
```

VPS reboot → container tự chạy lại.

---

## 9. Xử lý sự cố

| Hiện tượng | Cách xử lý |
| --- | --- |
| Build bị kill, `exit code 137` | Hết RAM lúc build → tạo swap ở mục 1 |
| `bind ... address already in use` | Cổng 3001 bị chiếm → đặt `HOST_PORT=3004` trong `.env`, đổi `proxy_pass` trong nginx cho khớp |
| Container restart liên tục | `docker compose logs api`, thường do biến số trong `.env` sai định dạng |
| `/health` báo `disconnected` | Sai `MONGO_URI` hoặc IP VPS chưa whitelist trong Atlas |
| `502` từ nginx | Container chưa chạy hoặc sai port → `curl http://127.0.0.1:3001/health` |
| `/v1/weather/*` trả `502` | Thiếu hoặc sai `OPENWEATHER_API_KEY` |
| `/v1/devices` trả `503` | Mongo chưa kết nối. Endpoint bão/thời tiết vẫn chạy bình thường |
| Push trả `503` | Thiếu biến `APNS_*` hoặc sai `APNS_PRIVATE_KEY_PATH` |
| Đầy đĩa | `docker image prune -f` |

---

## 10. Hai điều cần biết

**Chỉ chạy 1 container.** Scheduler quét bão chạy bên trong process Node, nên `docker compose up --scale api=2` sẽ quét 2 lần và gọi provider gấp đôi.

**`/v1/notifications/send` chưa có authentication.** Nếu mở API ra Internet, thêm block này vào file nginx:

```nginx
location = /v1/notifications/send {
    allow 127.0.0.1;
    allow <IP_CỦA_BẠN>;
    deny all;
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

**Về RAM:** cache in-memory của app tối đa ~166MB (map tile 50 + forecast 32 + cone 32 + spaghetti 16 + history 16 + track 12 + current 8), cộng Node baseline ~80MB. `MEM_LIMIT=400m` mặc định là đủ. VPS 512MB nên đặt `MEM_LIMIT=320m` và `NODE_MAX_OLD_SPACE_MB=192`; nếu container restart vì RAM thì giảm các hằng số giới hạn cache trong `src/adapters/cache/`. TTL cache đọc từ env (`NHC_CACHE_TTL_MS`, `ACTIVE_STORMS_CACHE_TTL_MS`, `HISTORICAL_STORM_TRACK_CACHE_TTL_MS`, `FORECAST_WEATHER_CACHE_TTL_MS`, `CURRENT_WEATHER_CACHE_TTL_MS`, `MAP_TILE_CACHE_TTL_MS`, `RADAR_CACHE_TTL_MS`). Khi không có biến môi trường, app dùng fallback production; staging/test có thể override trong `.env` thành 10 phút (forecast 20 phút).
