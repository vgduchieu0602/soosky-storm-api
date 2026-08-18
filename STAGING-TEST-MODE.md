# Staging Test-Mode: Giả lập bão "dissipated" cho Tester

Tài liệu này dùng cho staging (không phải production). Mục tiêu: cho tester kích hoạt
trạng thái `dissipated` của một bão **đang active thật** để test luồng alert/tracking,
mà **không sửa data thật của NHC/GDACS** và **không ảnh hưởng production**.

## Cách nó hoạt động

- `STORM_DATA_MODE=live` + `STORM_ALERT_TEST_MODE=true` sẽ mount endpoint:
  `POST /v1/test/storm-alerts/:stormId/dissipate` (chỉ mount khi flag bật — production tắt là tự động "đóng").
- Gọi endpoint sẽ:
  1. Ẩn bão đó trong RAM (`TestableActiveStormsRepository.hideStorm`) — NHC/GDACS không bị đổi.
  2. Trigger `DetectStormAlertsUseCase` → so sánh previous state (Mongo) với active source hiện tại
     (đã ẩn) → sinh alert `storm_dissipated`.
  3. Trả về `{ simulatedStatus: "dissipated", alerts, sent, ... }`.
- Sau đó `POST /v1/storms/tracking` với stormId đó sẽ trả `status: "dissipated"`.

⚠️ **Lưu ý quan trọng**
- Endpoint ghi vào Mongo `storm_states` (dù DB đã cô lập) và — nếu cấu hình APNs — sẽ gửi push thật.
  → Staging PHẢI dùng DB Mongo riêng (`soosky_storm_staging`) và APNs để trống (xem `.env.staging.example`).
- "Ẩn" chỉ là in-memory: **restart container sẽ reset** (bão hiện lại active). Nhưng các bản ghi
  `storm_states` đã ghi vào Mongo thì persist.

## Điều kiện tiên quyết (PREREQ)

Detector phải "nhìn thấy" bão ít nhất 1 lần (có `previousState` trong `storm_states`)
trước khi `/dissipate` hoạt động. Nếu chưa, endpoint trả `409 STORM_NOT_READY_FOR_DISSIPATION_TEST`.

Cách thoả mãn precondition trên staging:
- Để `ALERTS_POLL_INTERVAL_MS=60000` (1 phút) → detector tự ghi state sau ~1 phút kể từ khi start.
- Hoặc chủ động chờ 1 chu kỳ poll.

## Setup trên server staging

1. Copy template và điền secret:
   ```bash
   cp .env.staging.example .env.staging
   # sửa MONGO_URI (DB soosky_storm_staging), OPENWEATHER_API_KEY
   ```
2. Deploy container staging riêng (KHÔNG đè container production):
   - `HOST_PORT=3003` (prod đang 3001), container name `soosky-storm-api-staging`.
   - Dùng file `.env.staging` thay vì `.env`. Với docker compose, override env_file:
     ```yaml
     env_file:
       - .env.staging
     ```
   - Hoặc chạy local để verify nhanh:
     ```bash
     cp .env .env.staging && dotenv -e .env.staging -- npm run dev
     # (hoặc set tay 2 biến STORM_DATA_MODE=live STORM_ALERT_TEST_MODE=true rồi npm run dev)
     ```
3. Khởi động xong, đợi ~1 phút để detector ghi previous state.

## Quy trình test (curl)

```bash
BASE=http://localhost:3003

# 1) Health — data.database phải là "connected" (live, có Mongo staging)
curl -s "$BASE/health"

# 2) Chọn 1 bão đang active thật, ví dụ nhc:AL032026 (HURRICANE CHARLIE)
#    Xác nhận nó active:
curl -s -X POST "$BASE/v1/storms/tracking" \
  -H "content-type: application/json" \
  -d '{"stormIds":["nhc:AL032026"]}'
# -> status: "active"

# 3) Giả lập dissipated:
curl -s -X POST "$BASE/v1/test/storm-alerts/nhc:AL032026/dissipate"
# -> { "stormId":"nhc:AL032026", "simulatedStatus":"dissipated", "alerts":1, ... }
# Nếu 409 STORM_NOT_READY_FOR_DISSIPATION_TEST -> chưa đủ precondition, đợi thêm rồi gọi lại.

# 4) Xác nhận tracking giờ trả dissipated:
curl -s -X POST "$BASE/v1/storms/tracking" \
  -H "content-type: application/json" \
  -d '{"stormIds":["nhc:AL032026"]}'
# -> status: "dissipated"
```

## Reset (hết test)

- Đơn giản nhất: **restart container staging** → in-memory hidden set xoá, bão hiện lại active.
- Xoá sạch state đã ghi: drop collection `storm_states` trên DB `soosky_storm_staging`.

## Checklist an toàn trước khi bật

- [ ] `MONGO_URI` trỏ DB `soosky_storm_staging` (không phải DB production).
- [ ] `APNS_*` để trống (không gửi push thật) — trừ khi cố tình test push dev.
- [ ] Container staging có `HOST_PORT` khác production.
- [ ] `STORM_ALERT_TEST_MODE=false` trên production (mặc định đã vậy).
- [ ] Có test tự động cho endpoint này (hiện CHƯA có — xem phần tiếp theo).

## Thiếu sót cần bổ sung

Hiện tại **không có unit/integration test** nào cho `/v1/test/storm-alerts/:stormId/dissipate`
(chỉ có test cho tracking thường). Nên thêm `test/DissipateStorm.test.ts` bao phủ:
- dissipate thành công → tracking trả dissipated + có alert `storm_dissipated`.
- dissipate bão chưa có previous state → 409 STORM_NOT_READY_FOR_DISSIPATION_TEST.
- dissipate 2 lần → 409 STORM_ALREADY_DISSIPATED.
- dissipate bão không tồn tại trong active source → 404 STORM_NOT_FOUND.
