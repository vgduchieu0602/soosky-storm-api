# Soosky Storm API

Base URL mặc định khi chạy local: `http://127.0.0.1:3000`.

Mọi request có body phải gửi `Content-Type: application/json`. Body JSON tối đa 64 KB.

## Response conventions

Các endpoint JSON thành công dùng envelope sau:

```json
{
  "ok": true,
  "data": {},
  "cacheStatus": "upstream"
}
```

`cacheStatus` cho biết nguồn của dữ liệu:

| Giá trị | Ý nghĩa |
| --- | --- |
| `upstream` | Vừa lấy từ provider hoặc nguồn dữ liệu gốc. |
| `cached` | Trả từ cache còn hạn. |
| `stale` | Active-storm snapshot đã hết hạn được trả tạm vì provider đang không sẵn sàng. |
| `bypass` | Endpoint không có cache metadata. |

Lỗi dùng envelope:

```json
{
  "ok": false,
  "code": "BAD_REQUEST",
  "reason": "..."
}
```

Các mã lỗi chung:

| HTTP | Code | Ý nghĩa |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Path, query hoặc JSON body không hợp lệ. |
| 404 | `NOT_FOUND` | Route không tồn tại. |
| 404 | `STORM_NOT_FOUND` | Storm không tìm thấy ở endpoint lookup đơn lẻ. |
| 413 | `PAYLOAD_TOO_LARGE` | JSON body vượt giới hạn. |
| 502 | `UPSTREAM_UNAVAILABLE` | Provider dữ liệu bão tạm thời không sẵn sàng. |
| 503 | `STORAGE_UNAVAILABLE` | Database/storage không sẵn sàng. |
| 500 | `INTERNAL_SERVER_ERROR` | Lỗi không mong đợi. |

Thời gian là chuỗi ISO 8601 UTC. Wind speed của storm được biểu diễn bằng knots khi có giá trị.

## Storm IDs và enums

Storm ID hợp lệ:

```text
nhc:<BASIN><NN><YYYY>       ví dụ nhc:EP072026
gdacs:TC:<EVENT_ID>:<EPISODE> ví dụ gdacs:TC:1001297:51
```

`BASIN` là hai chữ in hoa. Một số endpoint historical NHC chỉ hỗ trợ `AL`, `EP`, `CP`.

Giá trị `source`: `nhc`, `gdacs`.

Giá trị `category`: `category_1` đến `category_5`, hoặc `null` khi dưới hurricane scale/không có dữ liệu.

## Health

### `GET /health`

Kiểm tra service và database status.

```json
{
  "ok": true,
  "data": {
    "service": "soosky-storm-api",
    "database": "connected"
  },
  "cacheStatus": "bypass"
}
```

## Storms

### `GET /v1/storms`

Lấy storms đang active.

Query parameter:

| Tên | Giá trị | Mặc định |
| --- | --- | --- |
| `region` | `all`, `us-nhc`, `gdacs` | `all` |

`region=us-nhc` chỉ phụ thuộc vào NHC; `region=gdacs` chỉ phụ thuộc vào GDACS. Nếu provider được chọn unavailable, endpoint trả `502 UPSTREAM_UNAVAILABLE`, không trả mảng rỗng giả. Với `region=all`, API vẫn graceful-degrade: một provider fail vẫn trả dữ liệu provider còn lại; chỉ 502 khi tất cả cùng fail.

Mỗi item trong `data` có các field chính:

```json
{
  "stormId": "nhc:EP072026",
  "name": "Genevieve",
  "source": "nhc",
  "basin": "eastern_north_pacific",
  "area": "PO",
  "lat": 22.3,
  "lon": -130.2,
  "datetime": "2026-07-31T21:00:00.000Z",
  "windSpeed": 50,
  "category": null,
  "alertLevel": null,
  "watchWarning": null
}
```

`area` là một trong `PO`, `AO`, `IO`.

Active-storm cache có stale-if-error: khi cache hết hạn và provider tạm lỗi, snapshot gần nhất có thể được trả với `cacheStatus: "stale"`.

### `GET /v1/storms/demo`

Trả 1-5 demo storms dựng từ historical tracks. Response item có cùng shape storm summary và thêm `isDemo: true`.

### `POST /v1/storms/tracking`

Resolve một batch gồm active và storms đã dissipate.

Request:

```json
{
  "stormIds": ["nhc:EP072026", "nhc:EP072025"]
}
```

`stormIds` bắt buộc là mảng 1-20 storm IDs hợp lệ. API fetch active list một lần, sau đó chỉ historical lookups cho các item không active; tối đa 5 historical lookups chạy đồng thời.

Với request hợp lệ về syntax, API trả HTTP 200 và giữ đúng ordering của `stormIds`. Item resolve thành công giữ nguyên contract:

```json
{
  "requestedStormId": "nhc:EP072026",
  "trackingId": "nhc:EP072026",
  "stormId": "nhc:EP072026",
  "name": "Genevieve",
  "source": "nhc",
  "area": "PO",
  "status": "active",
  "category": "category_2",
  "lat": 22.3,
  "lon": -130.2,
  "updatedAt": "2026-07-31T21:00:00.000Z",
  "endedAt": null
}
```

`status` của item success là `active` hoặc `dissipated`. Nếu một item không thể resolve, API không làm mất các item khác:

```json
[
  { "requestedStormId": "nhc:AL012025", "status": "not_found" },
  { "requestedStormId": "nhc:AL022025", "status": "unavailable" }
]
```

`not_found` nghĩa là historical lookup xác định storm không có dữ liệu. `unavailable` nghĩa là provider historical tạm lỗi. Nếu active-storm dependency không lấy được toàn bộ active list, request vẫn trả 502 vì batch không thể được phân loại đáng tin cậy.

### `GET /v1/storms/:stormId/track`

Lấy observed và forecast track của active storm NHC hoặc GDACS.

```json
{
  "stormId": "nhc:EP072026",
  "name": "Genevieve",
  "source": "nhc",
  "area": "PO",
  "issuedAt": "2026-07-31T21:00:00.000Z",
  "cachedUntil": "2026-07-31T23:00:00.000Z",
  "category": "category_2",
  "observed": [{ "lat": 22.3, "lon": -130.2, "datetime": "...", "windSpeed": 90, "category": "category_2" }],
  "forecast": [{ "lat": 23.0, "lon": -131.0, "datetime": "...", "windSpeed": 95, "category": "category_2", "forecastHour": 12 }]
}
```

### `GET /v1/storms/:stormId/cone`

Lấy NHC forecast cone hoặc GDACS event area GeoJSON.

```json
{
  "stormId": "nhc:EP072026",
  "source": "nhc",
  "issuedAt": "2026-07-31T21:00:00.000Z",
  "cachedUntil": "2026-07-31T23:00:00.000Z",
  "availability": "available",
  "geometryKind": "forecast_cone",
  "geojson": { "type": "Feature", "properties": {}, "geometry": {} }
}
```

`availability` có thể là `available`, `not_available`, `not_supported`. Khi không available, `geojson` là `null` và có thể có `reason`.

### `GET /v1/storms/:stormId/spaghetti`

Lấy NHC ATCF multi-model forecast. Chỉ nhận NHC storm ID.

```json
{
  "stormId": "nhc:EP072026",
  "source": "nhc-atcf",
  "cycleTime": "2026-07-31T18:00:00.000Z",
  "cachedUntil": "2026-07-31T20:00:00.000Z",
  "availability": "available",
  "models": [{
    "code": "AVNO",
    "label": "GFS",
    "points": [{ "forecastHour": 0, "lat": 22.3, "lon": -130.2, "windSpeed": 50 }]
  }]
}
```

### `GET /v1/storms/:stormId/history-track`

Lấy historical NHC best track hoặc GDACS observed track.

```json
{
  "stormId": "nhc:EP072025",
  "name": "EP072025",
  "source": "nhc",
  "trackKind": "best_track",
  "cachedUntil": null,
  "availability": "available",
  "history": [{ "lat": 15, "lon": -120, "datetime": "...", "windSpeed": 65, "category": "category_1" }]
}
```

`trackKind` có thể là `best_track`, `gdacs_observed_track` hoặc `null`.

## Weather

### `GET /v1/weather/forecast`

### `GET /v1/weather/current`

Cả hai endpoint cần query:

| Tên | Kiểu | Quy tắc |
| --- | --- | --- |
| `lat` | decimal | -90 đến 90, bắt buộc |
| `lon` | decimal | -180 đến 180, bắt buộc |
| `units` | string | `standard`, `metric`, `imperial`; mặc định `metric` |

Forecast trả `location`, `units`, `cachedUntil`, `hourly`, `daily`. Mỗi point gồm `time`, `temp`, `humidity`, `uvi`, `visibility`, `windSpeed`, `windDeg`, `windDirection`, `pop`, `rain1hMm`, `weather`.

Current weather trả `location`, `units`, `observedAt`, `cachedUntil`, `temperature`, `humidity`, `uvi`, `visibility`, `windSpeed`, `windDeg`, `windDirection`, `rain1h`, `precipitationProbability`, `weatherDescription`, `weather`.

`weather` là mảng item `{ id, main, description, icon }`; các giá trị unavailable có thể là `null`.

## Map và radar

### `GET /v1/map-tiles/:layer/:z/:x/:y`

Trả binary map tile, không dùng JSON envelope.

| Path parameter | Giá trị |
| --- | --- |
| `layer` | `windSpeed`, `temperature`, `pressure`, `precipitation` |
| `z` | Integer 0-12 |
| `x`, `y` | Integer trong phạm vi tile của zoom (`0..2^z-1`) |

Response có `Content-Type: image/png` khi thành công.

### `GET /v1/radar`

Trả RainViewer manifest:

```json
{
  "source": "rainviewer",
  "attribution": "Weather data by RainViewer",
  "attributionUrl": "https://www.rainviewer.com/",
  "host": "https://...",
  "tileTemplate": "https://...{path}/256/{z}/{x}/{y}/2/1_1.png",
  "past": [{ "time": "...", "path": "/v2/radar/..." }],
  "nowcast": [],
  "generatedAt": "...",
  "cachedUntil": "..."
}
```

## Alerts và notifications

### `POST /v1/alerts/query`

Request:

```json
{ "stormIds": ["nhc:EP072026"], "limit": 20 }
```

`stormIds` tuân theo validation 1-20 IDs. `limit` là integer 1-200, optional.

Mỗi alert có: `id`, `type`, `trackingId`, `stormId`, `stormName`, `previousValue`, `currentValue`, `lat`, `lon`, `windSpeed`, `category`, `title`, `description`, `observedAt`, `createdAt`.

`type`: `new_storm`, `category_change`, `track_change`, `alert_level_change`, `watch_warning`, `storm_dissipated`.

### `POST /v1/notifications/send`

Gửi APNs push notification.

```json
{
  "deviceToken": "64-to-200-character hexadecimal APNs token",
  "title": "Storm warning",
  "description": "Follow local authority guidance.",
  "stormId": "nhc:EP072026",
  "type": "category_change"
}
```

`deviceToken`, `title`, `description` bắt buộc. Title tối đa 256 ký tự; description tối đa 2048. `stormId` và `type` optional. Success `data` là `{ title, description, sent, stormId, type }`.

Push-specific errors: `INVALID_DEVICE_TOKEN` (400), `PUSH_NOT_CONFIGURED` (503), `PUSH_UNAVAILABLE` (502).

## Devices và subscriptions

APNs device token phải là chuỗi hexadecimal 64-200 ký tự.

### `POST /v1/devices`

```json
{ "deviceToken": "..." }
```

Response data: `{ "registered": true, "alreadyRegistered": false }`.

### `POST /v1/storm-subscriptions`

```json
{ "deviceToken": "...", "stormId": "nhc:EP072026" }
```

Response data: `{ "stormId": "nhc:EP072026", "subscribed": true, "alreadySubscribed": false }`.

### `POST /v1/storm-subscriptions/unsubscribe`

```json
{ "deviceToken": "...", "stormId": "nhc:EP072026" }
```

Response data: `{ "stormId": "nhc:EP072026", "subscribed": false, "removed": true }`.

### `PUT /v1/region-subscriptions`

```json
{
  "deviceToken": "...",
  "lat": 10.8231,
  "lon": 106.6297,
  "radiusKm": 300
}
```

`lat` phải trong -90..90, `lon` trong -180..180, `radiusKm` trong 1..2000. Response data: `{ "lat": 10.8231, "lon": 106.6297, "radiusKm": 300, "saved": true }`.

## Test-only endpoint

Khi `STORM_ALERT_TEST_MODE=true`, server mở thêm endpoint:

### `POST /v1/test/storm-alerts/:stormId/dissipate`

Mô phỏng storm active biến mất khỏi source và trigger detection cycle. Endpoint chỉ dành cho môi trường test; không dùng làm production contract.
