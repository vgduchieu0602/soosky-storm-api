# Hướng Dẫn Kiểm Thử Soosky Storm API - Fixture Mode

Tài liệu này dành cho FE, QA và developer cần test API với data local ổn định. Trong fixture mode, API không gọi NHC, GDACS, OpenWeather, RainViewer, MongoDB hoặc APNs.

## Bắt Đầu

Trong `.env`:

```env
STORM_DATA_MODE=fixture
```

Restart API sau khi đổi biến môi trường. Đặt base URL cho các lệnh dưới đây:

```bash
BASE=http://localhost:3000
curl -s "$BASE/health"
```

Kết quả health phải có `data.database: "fixture"`.

## Quy Ước Response

Các endpoint JSON thành công trả:

```json
{ "ok": true, "data": {}, "cacheStatus": "upstream" }
```

`GET /v1/map-tiles/...` là ngoại lệ: trả trực tiếp PNG với header `Content-Type: image/png`.

| `cacheStatus` | Ý nghĩa |
| --- | --- |
| `upstream` | Lần đầu source fixture được đọc rồi lưu cache. |
| `cached` | Trả từ cache trong RAM. |
| `bypass` | Endpoint không có cache, ví dụ health, device, subscription và push. |

Các mã lỗi thường gặp:

| HTTP | `code` | Test case |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Query/path/body không hợp lệ. |
| 404 | `STORM_NOT_FOUND` | Storm ID đúng định dạng nhưng không thuộc catalog fixture. |
| 404 | `NOT_FOUND` | Sai route hoặc method. |
| 413 | `PAYLOAD_TOO_LARGE` | JSON body lớn hơn 64 KB. |
| 429 | `RATE_LIMITED` | Vượt giới hạn request theo IP. |

Storm `windSpeed` dùng knot. Weather dùng đơn vị trong object `units`; đừng hardcode đơn vị ở FE.

## Danh Mục Fixture

### Bão Hoạt Động

Mọi ID trong bảng này có `track` và `cone`. Mọi ID NHC cũng có `spaghetti`.

| `stormId` | Tên | Category | Toạ độ | Trạng thái cần test |
| --- | --- | --- | --- | --- |
| `nhc:AL012026` | TROPICAL DEPRESSION ANDREW | `null`, 30 kt | 12.6, -45.8 | Category `null` trong track response. |
| `nhc:AL022026` | TROPICAL STORM BERYL | `null`, 60 kt | 22.4, -77.8 | Có `watchWarning`. |
| `nhc:AL032026` | HURRICANE CHARLIE | `category_1`, 75 kt | 25.1, -68.3 | Atlantic, hurricane watch. |
| `nhc:EP072026` | HURRICANE GENEVIEVE | `category_3`, 100 kt | 19.4, -116.6 | Weather bão mạnh để test. |
| `nhc:EP082026` | HURRICANE HILDA | `category_4`, 120 kt | 15.8, -109.2 | Eastern Pacific category 4. |
| `nhc:CP012026` | TROPICAL STORM IONA | `null`, 50 kt | 13.7, -160.4 | Central Pacific (`CP`). |
| `nhc:CP022026` | HURRICANE KELI | `category_2`, 90 kt | 17.2, -171.6 | Central Pacific (`CP`), có watch. |
| `gdacs:TC:1001297:51` | DOLPHIN-26 | `category_5`, 145 kt | 27, 124.8 | `alertLevel: "Orange"`, GDACS geometry. |
| `gdacs:TC:1001432:3` | MANGKHUT-26 | `null`, 45 kt | 18.3, 121.4 | `alertLevel: "Red"`, GDACS geometry. |

### Bão Lịch Sử

Các ID sau dùng cho `GET /v1/storms/:stormId/history-track` và trạng thái `dissipated` trong tracking:

```text
nhc:AL052025  ERIN
nhc:AL092025  IMELDA
nhc:AL132025  MELISSA
nhc:EP012025  ALVIN
nhc:EP032025
nhc:EP052025  ERICK
nhc:CP012025  IONA
nhc:CP022025  KELI
```

## Kiểm Tra Nhanh

Chạy các lệnh này trước khi QA sâu hơn:

```bash
curl -s "$BASE/health"
curl -s "$BASE/v1/storms"
curl -s "$BASE/v1/storms/nhc:CP022026/track"
curl -s "$BASE/v1/storms/nhc:CP022026/cone"
curl -s "$BASE/v1/storms/nhc:CP022026/spaghetti"
curl -s "$BASE/v1/storms/nhc:CP012025/history-track"
curl -s "$BASE/v1/weather/current?lat=19.4&lon=-116.6"
curl -s "$BASE/v1/weather/forecast?lat=19.4&lon=-116.6"
curl -s "$BASE/v1/radar"
curl -s -o tile.png -w "%{http_code} %{content_type}\n" "$BASE/v1/map-tiles/precipitation/3/6/3"
```

Mong đợi: 9 active storms, track/cone/spaghetti `CP` đều `200`, history có 2 điểm, weather ở tâm Genevieve là `Thunderstorm`, radar `source: "fixture"`, tile trả `200 image/png`.

## Checklist API Bão

### `GET /v1/storms`

```bash
curl -s "$BASE/v1/storms"
curl -s "$BASE/v1/storms?region=us-nhc"
curl -s "$BASE/v1/storms?region=gdacs"
```

| Case | Kỳ vọng |
| --- | --- |
| Không có query | 9 storms: 7 NHC và 2 GDACS. |
| `region=us-nhc` | 7 storms, gồm `CP012026` và `CP022026`. |
| `region=gdacs` | 2 storms, có alert level Orange và Red. |
| `region=abc` | `400 BAD_REQUEST`. |
| NHC | `area`, `message`, `alertLevel: null` được trả nhất quán. |
| GDACS | Có `area` và `alertLevel`. |

### `GET /v1/storms/:stormId/track`

```bash
curl -s "$BASE/v1/storms/nhc:CP022026/track"
curl -s "$BASE/v1/storms/gdacs:TC:1001297:51/track"
```

| Case | Kỳ vọng |
| --- | --- |
| NHC active | 1 `observed`, 3 `forecast` với `forecastHour` 12, 24, 48. |
| GDACS active | 2 `observed`, `forecast: []`. |
| NHC tropical depression/storm | `category: null` trong response format. |
| NHC hurricane | `category` là `category_1`…`category_5` và có `message`. |
| `nhc:AL092026` | `404 STORM_NOT_FOUND`. |
| `EP072026` | `400 BAD_REQUEST`. |

### `GET /v1/storms/:stormId/cone`

```bash
curl -s "$BASE/v1/storms/nhc:CP012026/cone"
curl -s "$BASE/v1/storms/gdacs:TC:1001432:3/cone"
```

| Case | Kỳ vọng |
| --- | --- |
| NHC, bao gồm CP | `availability: "available"`, `geometryKind: "forecast_cone"`, GeoJSON `Feature`. |
| GDACS | `geometryKind: "gdacs_event_area"`, GeoJSON `FeatureCollection`. |
| FE GDACS label | Phân biệt event area với forecast cone. |
| Active ID không có trong catalog | `404 STORM_NOT_FOUND`. |

### `GET /v1/storms/:stormId/spaghetti`

```bash
curl -s "$BASE/v1/storms/nhc:CP022026/spaghetti"
```

| Case | Kỳ vọng |
| --- | --- |
| Bất kỳ NHC active | `availability: "available"`, 3 models: `AVNO`, `AEMN`, `NVGM`. |
| Mỗi model | 5 points: 12, 24, 36, 48, 72 giờ. |
| Historical NHC, ví dụ `nhc:CP012025` | `200`, `availability: "not_available"`, `models: []`. |
| GDACS ID | `400 BAD_REQUEST`; route chỉ nhận NHC. |

### `GET /v1/storms/:stormId/history-track` and `POST /v1/storms/tracking`

```bash
curl -s "$BASE/v1/storms/nhc:CP012025/history-track"
curl -s -X POST "$BASE/v1/storms/tracking" \
  -H "content-type: application/json" \
  -d '{"stormIds":["nhc:CP022026","nhc:CP012025","gdacs:TC:1001297:99"]}'
```

| Case | Kỳ vọng |
| --- | --- |
| Historical fixture ID | `availability: "available"`, `trackKind: "best_track"`, 2 history points theo thời gian tăng dần. |
| Active + historical tracking | Có cả `status: "active"` và `status: "dissipated"`. |
| GDACS episode khác | `gdacs:TC:1001297:99` resolve thành active `gdacs:TC:1001297:51`. |
| `stormIds: []`, >20 IDs hoặc ID sai format | `400 BAD_REQUEST`. |
| Historical ID không thuộc catalog | `404 STORM_NOT_FOUND`. |

### `GET /v1/storms/demo`

```bash
curl -s "$BASE/v1/storms/demo"
```

Mỗi call trả ngẫu nhiên 1-5 historical demo storms. Mọi item có `isDemo: true`; không nên dùng endpoint này làm danh sách cố định.

## Checklist Weather

```bash
# Tâm Genevieve, category 3
curl -s "$BASE/v1/weather/current?lat=19.4&lon=-116.6"

# Tâm Dolphin, category 5
curl -s "$BASE/v1/weather/current?lat=27&lon=124.8"

# Vùng yên tĩnh
curl -s "$BASE/v1/weather/current?lat=10.8231&lon=106.6297"

curl -s "$BASE/v1/weather/forecast?lat=19.4&lon=-116.6"
```

| Case | Kỳ vọng |
| --- | --- |
| Tâm storm | `weather[0].main: "Thunderstorm"`, mưa lớn, visibility giảm. |
| Tâm Dolphin | Gió mạnh hơn Genevieve. |
| Ngoài bán kính 400 km | `Clear` hoặc `Clouds`, `rain1h: null`, visibility 10000 m. |
| `units=imperial` | `temperature: "F"`, `windSpeed: "mph"`. |
| `units=standard` | `temperature: "K"`, `windSpeed: "m/s"`. |
| Forecast | `hourly` có các mốc 3 giờ phủ 24 giờ kế tiếp; `daily` có 5 điểm. |
| Thiếu/sai `lat`, `lon`, `units` | `400 BAD_REQUEST`. |

`uvi` và `precipitationProbability` của current weather luôn là `null`. Với forecast, `uvi` luôn là `null`; đọc `pop` để lấy xác suất mưa.

## Checklist Map Và Radar

```bash
curl -s -o tile.png -w "%{http_code} %{content_type}\n" "$BASE/v1/map-tiles/windSpeed/3/6/3"
curl -s "$BASE/v1/radar"
```

| Case | Kỳ vọng |
| --- | --- |
| Map layers | `windSpeed`, `temperature`, `pressure`, `precipitation` đều proxy PNG từ OpenWeather. |
| Invalid layer, zoom <0 hoặc >12, invalid x/y | `400 BAD_REQUEST`. |
| Radar | `source: "rainviewer"`, có `past`, `nowcast`, `tileTemplate` từ RainViewer. |
| Radar tile | Dùng `tileTemplate` RainViewer sau khi thay `{path}`, `{z}`, `{x}`, `{y}`. |

## Checklist Device, Subscription Và Push

Fixture storage ở trong RAM và reset khi API restart. Tạo một token test 64 ký tự hex:

```bash
TOKEN=$(printf 'a%.0s' {1..64})

curl -s -X POST "$BASE/v1/devices" \
  -H "content-type: application/json" \
  -d "{\"deviceToken\":\"$TOKEN\"}"

curl -s -X POST "$BASE/v1/storm-subscriptions" \
  -H "content-type: application/json" \
  -d "{\"deviceToken\":\"$TOKEN\",\"stormId\":\"nhc:CP022026\"}"

curl -s -X PUT "$BASE/v1/region-subscriptions" \
  -H "content-type: application/json" \
  -d "{\"deviceToken\":\"$TOKEN\",\"lat\":10.8231,\"lon\":106.6297,\"radiusKm\":300}"

curl -s -X POST "$BASE/v1/notifications/send" \
  -H "content-type: application/json" \
  -d "{\"deviceToken\":\"$TOKEN\",\"title\":\"Fixture alert\",\"description\":\"No APNs request is made.\",\"stormId\":\"nhc:CP022026\",\"type\":\"new_storm\"}"
```

| Case | Kỳ vọng |
| --- | --- |
| Register token lần đầu/lần hai | `alreadyRegistered` lần lượt `false`/`true`. |
| Subscribe cùng pair lần hai | `alreadySubscribed: true`, không tạo bản ghi trùng. |
| Unsubscribe chưa tồn tại | `200`, `removed: false`. |
| Region save lần hai | Ghi đè region trước đó. |
| `radiusKm` 1 và 2000 | Hợp lệ; 0 và 2001 trả `400 BAD_REQUEST`. |
| Token sai hex hoặc ngắn hơn 64 | `400 BAD_REQUEST`. |
| Fake push hợp lệ | `sent: true`; không gửi APNs thật. |
| Response storage/push | Không bao giờ echo `deviceToken`. |

Scheduler alert tự động luôn tắt trong fixture mode.

## Kịch Bản End-To-End

1. Gọi `GET /v1/storms` và hiển thị đủ 9 active storms.
2. Mở `nhc:CP022026`; gọi track, cone và spaghetti song song.
3. Hiển thị `forecast_cone`, 3 model tracks và category 2 safety message.
4. Gọi weather tại `17.2,-171.6` để render trạng thái thời tiết bão.
5. Register device, subscribe `nhc:CP022026` và lưu region.
6. Gửi manual fixture notification với `type: "new_storm"`; FE route đến storm detail bằng `stormId`.
7. Dùng tracking với `nhc:CP022026` và `nhc:CP012025` để render một active card và một dissipated card.
8. Mở history track của `nhc:CP012025`.

## Báo Lỗi

Mỗi bug report cần có:

- Method, full URL và request body/query.
- HTTP status và toàn bộ response body/header liên quan.
- `STORM_DATA_MODE`, base URL và thời điểm gọi UTC.
- Storm ID, nếu bug liên quan storm detail.
- Screenshot/video và phiên bản FE nếu là lỗi UI.
