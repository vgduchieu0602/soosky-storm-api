# Hướng dẫn test Soosky Storm API (fixture mode)

Tài liệu dành cho **Tester**. Mục tiêu: test được toàn bộ API mà không phụ thuộc mùa bão, không phụ thuộc NHC/GDACS/OpenWeather còn sống hay không.

---

## 1. Bật data test

Trong `.env` của môi trường test:

```bash
STORM_DATA_MODE=fixture
```

Kiểm tra API sống:

```bash
BASE=https://project3.vuonghieu.site      # đổi theo môi trường đang test
curl -s "$BASE/health"
```

```json
{ "ok": true, "data": { "service": "soosky-storm-api", "database": "connected" }, "cacheStatus": "bypass" }
```

`database` là `connected` / `disconnected` / `unknown`. Chỉ nhóm API device + subscription cần Mongo; các API còn lại vẫn chạy khi `database` không phải `connected`.

---

## 2. Quy ước chung — đọc trước khi test

**Thành công** luôn có 3 khoá:

```json
{ "ok": true, "data": { }, "cacheStatus": "upstream" }
```

| `cacheStatus` | Nghĩa |
|---|---|
| `upstream` | Lần gọi này lấy data mới, chưa có trong cache |
| `cached` | Trả từ cache trong RAM |
| `bypass` | Endpoint không có cache (`/health`, `/v1/notifications/send`, device, subscription) |

**Lỗi** luôn có `ok: false` + `code` + `reason`:

| HTTP | `code` | Khi nào |
|---|---|---|
| 400 | `BAD_REQUEST` | Sai/thiếu tham số, body không phải JSON hợp lệ |
| 404 | `STORM_NOT_FOUND` | `stormId` đúng định dạng nhưng không có data |
| 404 | `NOT_FOUND` | Sai đường dẫn hoặc sai method |
| 413 | `PAYLOAD_TOO_LARGE` | Body quá lớn |
| 429 | `RATE_LIMITED` | Quá **60 request/phút/IP** |
| 502 | `UPSTREAM_UNAVAILABLE` | Provider lỗi (fixture mode gần như không gặp) |
| 503 | `STORAGE_UNAVAILABLE` | Mất kết nối Mongo |
| 400/502/503 | `INVALID_DEVICE_TOKEN` / `PUSH_UNAVAILABLE` / `PUSH_NOT_CONFIGURED` | Nhóm push |

**Quy tắc số liệu:** field provider không có luôn là `null`, **không bao giờ** là `0` hay chuỗi rỗng. Đơn vị: gió **knot** (trong storm API) hoặc **m/s / mph** (trong weather API, xem `units` trong response), khoảng cách **km**, mưa **mm**, thời gian **ISO 8601 UTC**.

**TTL cache hiện tại (giai đoạn test):** 10 phút cho mọi API, riêng `/v1/weather/forecast` 20 phút.

---

## 3. Bộ data test có sẵn

### 9 cơn bão đang hoạt động

| `stormId` | Tên | Cấp | Vị trí | Đặc điểm để test |
|---|---|---|---|---|
| `nhc:AL012026` | TROPICAL DEPRESSION ANDREW | `tropical_depression` (30 kt) | 12.6 / -45.8 | NHC Atlantic, không watch/warning |
| `nhc:AL022026` | TROPICAL STORM BERYL | `tropical_storm` (60 kt) | 22.4 / -77.8 | Có `watchWarning` |
| `nhc:AL032026` | HURRICANE CHARLIE | `category_1` (75 kt) | 25.1 / -68.3 | NHC Atlantic, có hurricane watch |
| `nhc:EP072026` | HURRICANE GENEVIEVE | `category_3` (100 kt) | 19.4 / -116.6 | NHC Eastern Pacific |
| `nhc:EP082026` | HURRICANE HILDA | `category_4` (120 kt) | 15.8 / -109.2 | NHC Eastern Pacific |
| `nhc:CP012026` | TROPICAL STORM IONA | `tropical_storm` (50 kt) | 13.7 / -160.4 | NHC Central Pacific (`CP`) |
| `nhc:CP022026` | HURRICANE KELI | `category_2` (90 kt) | 17.2 / -171.6 | NHC Central Pacific (`CP`), có watch |
| `gdacs:TC:1001297:51` | DOLPHIN-26 | `category_5` (145 kt) | 27 / 124.8 | GDACS, `alertLevel: "Orange"` |
| `gdacs:TC:1001432:3` | MANGKHUT-26 | `tropical_storm` (45 kt) | 18.3 / 121.4 | GDACS, `alertLevel: "Red"` |

### 8 cơn bão lịch sử (dùng cho `/history-track`)

`nhc:AL052025` (ERIN) · `nhc:AL092025` (IMELDA) · `nhc:AL132025` (MELISSA) · `nhc:EP012025` (ALVIN) · `nhc:EP032025` · `nhc:EP052025` (ERICK) · `nhc:CP012025` (IONA) · `nhc:CP022025` (KELI)

Mỗi bão 2 điểm lịch sử, cấp từ `tropical_storm` tới `category_5`.

### Data suy ra từ 9 bão trên

- **Spaghetti:** mọi bão NHC active đều có model, bao gồm cả `nhc:CP012026` và `nhc:CP022026`.
- **Weather:** toạ độ nằm trong **bán kính 400 km** quanh một bão fixture sẽ trả thời tiết bão; ngoài bán kính trả ngày quang mây.

---

## 4. Checklist test từng API

### 4.1 `GET /v1/storms` — danh sách bão

```bash
curl -s "$BASE/v1/storms"
curl -s "$BASE/v1/storms?region=us-nhc"
curl -s "$BASE/v1/storms?region=gdacs"
```

| # | Case | Kết quả mong đợi |
|---|---|---|
| 1 | Gọi không tham số | 200, đúng **9 bão** theo thứ tự Atlantic → Eastern Pacific → Central Pacific → GDACS |
| 2 | `region=us-nhc` | Chỉ 7 bão `source: "nhc"`, bao gồm `CP012026` và `CP022026` |
| 3 | `region=gdacs` | Chỉ 2 bão `source: "gdacs"` |
| 4 | `region=abc` | 400 `BAD_REQUEST` |
| 5 | Kiểm tra `area` | NHC: `"North Atlantic Ocean"` / `"Eastern North Pacific Ocean"`; GDACS: `"Marshall Islands, Japan, China"` |
| 6 | Kiểm tra `message` | Cả 9 bão đều có câu khuyến nghị an toàn theo `category` |
| 7 | Kiểm tra `alertLevel` | `null` với NHC, GDACS có cả `"Orange"` và `"Red"` |
| 8 | Gọi lần 2 trong 10 phút | `cacheStatus` đổi từ `upstream` sang `cached` |

### 4.2 `GET /v1/storms/:stormId/track` — đường đi

```bash
curl -s "$BASE/v1/storms/nhc:EP072026/track"
curl -s "$BASE/v1/storms/gdacs:TC:1001297:51/track"
```

| # | Case | Kết quả mong đợi |
|---|---|---|
| 1 | Bão NHC | 200, **1 điểm** `observed` + **3 điểm** `forecast` (`forecastHour` = 12, 24, 48) |
| 2 | Bão GDACS | 200, **2 điểm** `observed`, `forecast: []` — FE không được crash |
| 3 | `windSpeed` trong forecast | Giảm dần theo `forecastHour` |
| 4 | `nhc:AL092026` (đúng định dạng, không có data) | 404 `STORM_NOT_FOUND` |
| 5 | `EP072026` (thiếu tiền tố) | 400 `BAD_REQUEST` |
| 6 | `cachedUntil` | ISO UTC, cách hiện tại ~10 phút |

### 4.3 `GET /v1/storms/:stormId/cone` — vùng dự báo

```bash
curl -s "$BASE/v1/storms/nhc:AL022026/cone"
curl -s "$BASE/v1/storms/gdacs:TC:1001297:51/cone"
```

| # | Case | Kết quả mong đợi |
|---|---|---|
| 1 | Bão NHC | `geometryKind: "forecast_cone"`, GeoJSON kiểu `Feature` |
| 2 | Bão GDACS | `geometryKind: "gdacs_event_area"`, GeoJSON kiểu `FeatureCollection` — FE phải parse được cả 2 |
| 3 | UI khi là `gdacs_event_area` | Phải hiển thị ghi chú "không phải cone dự báo chính thức" |
| 4 | ID không có data | 404 `STORM_NOT_FOUND` |

### 4.4 `GET /v1/storms/:stormId/history-track` — đường đi lịch sử

```bash
curl -s "$BASE/v1/storms/nhc:AL052025/history-track"
curl -s "$BASE/v1/storms/nhc:EP052025/history-track"
```

| # | Case | Kết quả mong đợi |
|---|---|---|
| 1 | 8 ID ở mục 3 | 200, `availability: "available"`, `trackKind: "best_track"`, 2 điểm |
| 2 | `history` | Sort **tăng dần** theo `datetime` |
| 3 | Dải cấp bão | `nhc:EP012025` → `tropical_storm`; `nhc:EP052025` → `category_5` |
| 4 | `nhc:AL012024` | 404 `STORM_NOT_FOUND` |

### 4.5 `GET /v1/storms/demo` — bão demo

```bash
curl -s "$BASE/v1/storms/demo"
```

| # | Case | Kết quả mong đợi |
|---|---|---|
| 1 | Gọi nhiều lần | Mỗi lần trả **1–5 bão ngẫu nhiên** trong 7 bão lịch sử |
| 2 | Mọi phần tử | Có `isDemo: true` — FE phải gắn nhãn demo |
| 3 | Ổn định | Không lần nào lỗi 404/502 |

### 4.6 `POST /v1/storms/tracking` — thẻ theo dõi

```bash
curl -s -X POST "$BASE/v1/storms/tracking" \
  -H "content-type: application/json" \
  -d '{"stormIds":["nhc:EP072026","nhc:AL052025"]}'
```

| # | Case | Kết quả mong đợi |
|---|---|---|
| 1 | 1 bão active + 1 bão lịch sử | 1 thẻ `status: "active"` (`endedAt: null`), 1 thẻ `status: "dissipated"` (có `endedAt`) |
| 2 | GDACS đổi episode: gửi `gdacs:TC:1001297:99` | Vẫn khớp bão, `stormId` trả về là `gdacs:TC:1001297:51`, `requestedStormId` giữ nguyên ID đã gửi |
| 3 | ID không tồn tại | 404 `STORM_NOT_FOUND` |
| 4 | `stormIds: []` hoặc > 20 phần tử | 400 `BAD_REQUEST` |

### 4.7 `GET /v1/storms/:stormId/spaghetti` — model dự báo

```bash
curl -s "$BASE/v1/storms/nhc:EP072026/spaghetti"
```

| # | Case | Kết quả mong đợi |
|---|---|---|
| 1 | `nhc:EP072026` / `nhc:AL022026` | `availability: "available"`, **3 model** `AVNO` (GFS), `AEMN` (GEFS Mean), `NVGM` (NAVGEM) |
| 2 | Mỗi model | **5 điểm**, `forecastHour` = 12, 24, 36, 48, 72; 3 model toả ra 3 hướng khác nhau |
| 3 | `cycleTime` | Bằng `issuedAt` của bão trong `/track` |
| 4 | `nhc:AL012026` | `availability: "not_available"`, `models: []`, có `reason` — **vẫn HTTP 200** |
| 5 | `gdacs:TC:1001297:51` | 400 `BAD_REQUEST` (endpoint chỉ nhận ID NHC) |

### 4.8 `GET /v1/weather/current` — thời tiết hiện tại

```bash
# Tâm bão HURRICANE GENEVIEVE
curl -s "$BASE/v1/weather/current?lat=19.4&lon=-116.6"
# Xa mọi cơn bão
curl -s "$BASE/v1/weather/current?lat=10.8231&lon=106.6297"
```

| # | Case | Kết quả mong đợi |
|---|---|---|
| 1 | Tâm `nhc:EP072026` | `weather[0].main: "Thunderstorm"`, `windSpeed` ≈ **51.4 m/s** (đúng 100 kt của bão), `rain1h` > 15, `visibility` ≤ 2000 |
| 1b | Field `uvi` và `precipitationProbability` | **Luôn `null`** — nguồn Current Weather Data 2.5 không có 2 field này. Muốn xem xác suất mưa thì đọc `pop` trong `/v1/weather/forecast` |
| 2 | Tâm `gdacs:TC:1001297:51` (27 / 124.8) | Gió mạnh hơn case 1 (bão 145 kt) |
| 3 | Cách tâm bão ~200 km | Vẫn có mưa nhưng gió/mưa **nhẹ hơn** tâm bão |
| 4 | TP.HCM (10.8231 / 106.6297) | `Clear` hoặc `Clouds`, `rain1h: null`, `visibility: 10000`, gió < 6 m/s |
| 5 | `units=imperial` | `units.temperature: "F"`, `units.windSpeed: "mph"`, số liệu đổi đơn vị tương ứng |
| 6 | `units=standard` | `units.temperature: "K"` |
| 7 | Thiếu `lat` hoặc `lon`, hoặc `lat=91`, hoặc `units=abc` | 400 `BAD_REQUEST` |
| 8 | Gọi lại cùng toạ độ | Kết quả **giống hệt** (data tất định), `cacheStatus: "cached"` |

### 4.9 `GET /v1/weather/forecast` — dự báo

```bash
curl -s "$BASE/v1/weather/forecast?lat=19.4&lon=-116.6"
```

| # | Case | Kết quả mong đợi |
|---|---|---|
| 1 | Số điểm | `hourly` **chỉ các mốc 3 giờ còn lại của ngày gọi API** (tối đa 8, gọi càng muộn càng ít), `daily` **5 điểm** (12:00 giờ địa phương) |
| 1a | Mốc giờ | Chia theo UTC nên giờ VN là 01, 04, 07, 10, 13, 16, 19, 22. Gọi lúc 08:00 VN → mốc đầu là 07:00 (đang chạy), không có 01:00 và 04:00. Gọi 23:30 → chỉ còn 1 điểm |
| 1b | `daily` | Backend tự gom từ `hourly`: `temp` lấy điểm gần 12:00, `pop` và `windSpeed` lấy max trong ngày, `rain1hMm` là **tổng mm cả ngày** |
| 1c | `uvi` | Luôn `null` ở cả `hourly` và `daily` |
| 2 | Khớp với `/weather/current` | Cùng toạ độ → điểm `hourly[0]` cùng kiểu thời tiết với `/weather/current` |
| 3 | Tại tâm bão | `pop` cao, `rain1hMm` lớn, `weather[0].main: "Thunderstorm"` |
| 4 | `cachedUntil` | Cách hiện tại ~**20 phút** (forecast có TTL riêng) |
| 5 | Tham số sai | 400 `BAD_REQUEST` |

### 4.10 `GET /v1/map-tiles/:layer/:z/:x/:y` — ảnh tile

> Fixture mode trả PNG màu sinh local; live mode vẫn gọi OpenWeather.

```bash
curl -s -o tile.png -w "%{http_code} %{content_type}\n" "$BASE/v1/map-tiles/temperature/5/25/15"
```

| # | Case | Kết quả mong đợi |
|---|---|---|
| 1 | 4 layer `windSpeed`, `temperature`, `pressure`, `precipitation` | 200, `Content-Type: image/png` |
| 2 | Layer lạ | 400 `BAD_REQUEST` |
| 3 | `z` ngoài khoảng **2–7** | 400 `BAD_REQUEST` |
| 4 | `x`/`y` ngoài `0 … 2^z − 1` | 400 `BAD_REQUEST` |

### 4.11 `GET /v1/radar` — khung radar

> Fixture mode trả manifest local và trỏ tile về `/v1/map-tiles/precipitation/...`; live mode vẫn gọi RainViewer.

| # | Case | Kết quả mong đợi |
|---|---|---|
| 1 | Gọi bình thường | 200, có `host`, `tileTemplate`, `past[]`, `nowcast[]` (có thể rỗng) |
| 2 | Attribution | `attribution` + `attributionUrl` **bắt buộc hiển thị** trên UI |

### 4.12 Device & Subscription (cần Mongo)

```bash
TOKEN=$(printf 'a%.0s' {1..64})

curl -s -X POST "$BASE/v1/devices" -H "content-type: application/json" -d "{\"deviceToken\":\"$TOKEN\"}"
curl -s -X POST "$BASE/v1/storm-subscriptions" -H "content-type: application/json" \
  -d "{\"deviceToken\":\"$TOKEN\",\"stormId\":\"nhc:EP072026\"}"
curl -s -X POST "$BASE/v1/storm-subscriptions/unsubscribe" -H "content-type: application/json" \
  -d "{\"deviceToken\":\"$TOKEN\",\"stormId\":\"nhc:EP072026\"}"
curl -s -X PUT "$BASE/v1/region-subscriptions" -H "content-type: application/json" \
  -d "{\"deviceToken\":\"$TOKEN\",\"lat\":10.8231,\"lon\":106.6297,\"radiusKm\":300}"
```

| # | Case | Kết quả mong đợi |
|---|---|---|
| 1 | Đăng ký device token hex 64 ký tự | 200 |
| 2 | Token không phải hex, hoặc < 64 / > 200 ký tự | 400 `BAD_REQUEST` |
| 3 | Subscribe 1 trong 3 `stormId` fixture | 200 |
| 4 | Subscribe 2 lần cùng bão | Lần 1: `alreadySubscribed: false`. Lần 2: 200, `alreadySubscribed: true`, không tạo bản ghi trùng |
| 5 | Unsubscribe bão chưa subscribe | 200, `removed: false`, không lỗi |
| 6 | `radiusKm` = 1 và = 2000 | 200 (biên hợp lệ) |
| 7 | `radiusKm` = 0 hoặc 2001 | 400 `BAD_REQUEST` |
| 8 | Mất kết nối Mongo | 503 `STORAGE_UNAVAILABLE` |
| 9 | Mọi response | **Không bao giờ** echo lại `deviceToken` |

### 4.13 `POST /v1/notifications/send` — push thủ công

Cần APNs đã cấu hình và **device token thật lấy từ app iOS**.

```bash
curl -s -X POST "$BASE/v1/notifications/send" -H "content-type: application/json" -d '{
  "deviceToken": "<token thật từ app>",
  "title": "Storm Warning",
  "description": "Hurricane Genevieve may affect your area.",
  "stormId": "nhc:EP072026",
  "type": "new_storm"
}'
```

`type` chỉ nhận 6 giá trị: `new_storm`, `category_change`, `track_change`, `alert_level_change`, `watch_warning`, `storm_dissipated`.

| # | Case | Kết quả mong đợi |
|---|---|---|
| 1 | Đủ field | 200, máy nhận được push; response echo `stormId` + `type` |
| 2 | Không gửi `stormId` / `type` | 200, response vẫn có 2 khoá với giá trị `null` |
| 3 | Bấm vào push có `stormId` | App mở đúng màn hình cơn bão đó |
| 4 | `type: "storm_update"` (giá trị lạ) | 400 `BAD_REQUEST` |
| 5 | `stormId: "EP072026"` (sai định dạng) | 400 `BAD_REQUEST` |
| 6 | `title` > 256 ký tự hoặc `description` > 2048 ký tự | 400 `BAD_REQUEST` |
| 7 | Token giả (64 chữ `a`) | 400 `INVALID_DEVICE_TOKEN` |
| 8 | Chưa cấu hình APNs trên server | 503 `PUSH_NOT_CONFIGURED` |
| 9 | Mọi response | Không lộ `deviceToken` |

**Lưu ý:** trong fixture mode **scheduler alert tự động bị tắt** để không gửi push giả cho người dùng thật. Muốn test luồng push thì dùng chính endpoint này.

---

## 5. Kịch bản end-to-end theo luồng người dùng

1. Mở app → `GET /v1/storms` → thấy 3 bão, đủ `area` + `message` + `category`.
2. Chọn HURRICANE GENEVIEVE → `GET /v1/storms/nhc:EP072026/track` + `/cone` + `/spaghetti` → vẽ được đường đi, vùng ảnh hưởng, 3 model.
3. Xem thời tiết tại tâm bão → `GET /v1/weather/current?lat=19.4&lon=-116.6` → cảnh báo giông, gió ~51 m/s (khớp cấp 3 ở bước 1).
4. Xem dự báo → `GET /v1/weather/forecast?lat=19.4&lon=-116.6` → 40 điểm cách 3 giờ + 5 ngày, khớp với bước 3.
5. Theo dõi bão → `POST /v1/devices` → `POST /v1/storm-subscriptions`.
6. Nhận cảnh báo → `POST /v1/notifications/send` với `stormId: "nhc:EP072026"`, `type: "new_storm"` → bấm push → app mở đúng màn hình bão ở bước 2.
7. Xem lại bão cũ → `POST /v1/storms/tracking` với `["nhc:EP072026","nhc:AL052025"]` → 1 thẻ active, 1 thẻ dissipated → mở `/history-track` của bão dissipated.

---

## 6. Test cache

1. Gọi `GET /v1/storms` lần 1 → `cacheStatus: "upstream"`, ghi lại `cachedUntil`.
2. Gọi lại ngay → `cacheStatus: "cached"`, `cachedUntil` **không đổi**.
3. Chờ qua mốc `cachedUntil` (10 phút) → gọi lại → `upstream`, `cachedUntil` mới.
4. `/v1/weather/forecast` dùng TTL **20 phút**, các API còn lại 10 phút.

---

## 7. Giới hạn đã biết của data test

- Trong `STORM_DATA_MODE=fixture`, `/v1/map-tiles/...` trả PNG sinh local và `/v1/radar` trả manifest local; không cần mạng hay `OPENWEATHER_API_KEY`.
- Device, storm subscription và region subscription ở fixture mode chỉ lưu trong RAM; restart API sẽ xoá dữ liệu test. `/v1/notifications/send` trả thành công nhưng không gửi APNs.
- Không sinh được case `availability: "not_available"` / `"not_supported"` của `/cone`; muốn test 2 trạng thái đó phải chạy `STORM_DATA_MODE=live` hoặc dùng collection `postman/Soosky-Storm-API-Cone-Not-Available-Mock.postman_collection.json`.
- Bão fixture **không di chuyển** — không test được thay đổi vị trí giữa 2 lần gọi.
- Scheduler alert tắt → không có push tự động.
- `nhc:EP032025` có trong `/history-track` nhưng **không** nằm trong pool của `/v1/storms/demo`.

---

## 8. Báo lỗi kèm gì

Mỗi bug gửi kèm:

- Full URL + method + body request.
- Response đầy đủ (`ok`, `code`, `reason`, `cacheStatus`) và HTTP status.
- Thời điểm gọi (giờ UTC) — cần để đối chiếu cache.
- `STORM_DATA_MODE` đang là `fixture` hay `live`.
- Môi trường (local / VPS) và base URL.
