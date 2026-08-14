# Soosky Storm API

**Base URL:** `https://project3.vuonghieu.site`
**Postman:** `postman/Soosky-Storm-API.postman_collection.json`

---

## 0. Quy ước chung

Mọi response JSON theo một trong hai dạng:

```jsonc
{ "ok": true,  "data": <payload> }                        // thành công
{ "ok": false, "code": "<MÃ>", "reason": "<mô tả>" }      // lỗi
```

Ngoại lệ duy nhất: `GET /v1/map-tiles/...` trả **ảnh PNG nhị phân**, không phải JSON.

### Mã lỗi

| HTTP | `code` | Khi nào |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Query/path/body param không hợp lệ, hoặc body không phải JSON |
| 400 | `INVALID_DEVICE_TOKEN` | Device token sai định dạng hoặc bị APNs từ chối |
| 404 | `NOT_FOUND` | Route không tồn tại |
| 404 | `STORM_NOT_FOUND` | Storm ID đúng định dạng nhưng provider không có bão đó |
| 413 | `PAYLOAD_TOO_LARGE` | Request body vượt 64 kb |
| 429 | `RATE_LIMITED` | Vượt 60 request/phút/IP |
| 500 | `INTERNAL_SERVER_ERROR` | Lỗi không mong đợi |
| 502 | `UPSTREAM_UNAVAILABLE` | NHC/GDACS/OpenWeather/RainViewer lỗi hoặc đổi format |
| 502 | `PUSH_UNAVAILABLE` | APNs lỗi |
| 503 | `PUSH_NOT_CONFIGURED` | Server chưa cấu hình APNs |
| 503 | `STORAGE_UNAVAILABLE` | MongoDB chưa kết nối |

### ⚠️ Bảng ĐƠN VỊ

| Field | Đơn vị | Ghi chú quan trọng |
| --- | --- | --- |
| `windSpeed` (storm) | **knot (kt)** | **KHÔNG phải km/h.** Nhân **1.852** để ra km/h. Ví dụ 145 kt = 269 km/h |
| `windSpeed` (weather) | Theo `units.windSpeed`: **m/s** hoặc **mph** | Xem object `units` trong response |
| `temperature`, `temp` | Theo `units.temperature`: **°C**, **°F** hoặc **K** | Xem object `units` trong response |
| `humidity` | **%** (0–100) | |
| `visibility` | **mét** | 10000 = 10 km |
| `rain1h`, `rain1hMm` | **mm** (lượng mưa 1 giờ) | `null` khi không mưa, **không phải 0** |
| `pop`, `precipitationProbability` | **tỉ lệ 0–1** | **KHÔNG phải %.** 0.79 = 79% |
| `uvi` | Chỉ số UV, không đơn vị | Thang 0–11+ |
| `windDeg` | **độ, 0–360** | 0 = Bắc, 90 = Đông |
| `windDirection` | Chuỗi 16 hướng | `N`, `NNE`, `NE`, ... `NNW` |
| `lat`, `lon` | **độ thập phân** | lat −90…90, lon −180…180 |
| `radiusKm` | **km** | 1–2000 |
| `forecastHour` | **giờ** kể từ `issuedAt` | Số nguyên |
| `datetime`, `issuedAt`, `observedAt`, `time`, `cachedUntil`, `generatedAt` | **ISO 8601, luôn UTC** | Ví dụ `2026-08-09T01:39:20.000Z` |
| `alertLevel` | Không đơn vị | GDACS: `Green`/`Orange`/`Red`. NHC: luôn `null` |

### Ngưỡng `category` (theo knot)

| `category` | windSpeed (kt) | km/h |
| --- | --- | --- |
| `tropical_depression` | ≤ 33 | ≤ 61 |
| `tropical_storm` | 34–63 | 63–117 |
| `category_1` | 64–82 | 118–152 |
| `category_2` | 83–95 | 154–176 |
| `category_3` | 96–112 | 178–207 |
| `category_4` | 113–136 | 209–252 |
| `category_5` | ≥ 137 | ≥ 254 |
| `unknown` | `windSpeed` là `null` | — |

### Định dạng `stormId`

| Dạng | Ví dụ | Ghi chú |
| --- | --- | --- |
| `nhc:XXNNYYYY` | `nhc:AL092025` | XX = basin (AL/EP/CP), NN = số bão, YYYY = năm |
| `gdacs:TC:{eventId}:{episodeId}` | `gdacs:TC:1001297:55` | **`episodeId` thay đổi mỗi lần GDACS cập nhật** — cùng một cơn bão sẽ đổi `stormId`. Backend tự xử lý việc này cho alert, nhưng FE nên lấy `stormId` mới từ `/v1/storms` mỗi lần |

### Quy tắc `null`

Field nào provider không cung cấp thì là **`null`**, không bao giờ là `0` hay chuỗi rỗng. FE phải xử lý `null` cho mọi field số.

### Cache status cho tester

Mọi response JSON thành công có trường top-level `cacheStatus` để tester biết request có gọi upstream hay không:

```json
{
  "ok": true,
  "data": {},
  "cacheStatus": "cached"
}
```

| Giá trị | Ý nghĩa |
| --- | --- |
| `upstream` | Cache miss: API vừa gọi nguồn dữ liệu/provider. |
| `cached` | Cache hit: dữ liệu được trả từ cache in-memory, không gọi provider. |
| `bypass` | Endpoint không dùng cache, ví dụ health, đăng ký device và subscribe/unsubscribe. |

Nếu nguồn dữ liệu lỗi, response `502 UPSTREAM_UNAVAILABLE` cũng có `cacheStatus: "upstream"`.

`GET /v1/map-tiles/:z/:x/:y` trả dữ liệu ảnh nhị phân nên không có `cacheStatus`: không dùng header thay thế để tránh thay đổi hoặc làm hỏng contract ảnh.

---

## 1. `GET /health`

**Input:** không.

**Output 200:**

| Field | Kiểu | Giá trị |
| --- | --- | --- |
| `service` | string | Luôn `"soosky-storm-api"` |
| `database` | string | `connected` / `connecting` / `disconnecting` / `disconnected` |

```json
{ "ok": true, "data": { "service": "soosky-storm-api", "database": "connected" } }
```

`database` khác `connected` → các endpoint device/subscription sẽ trả 503, nhưng endpoint bão/thời tiết vẫn hoạt động.

---

## 2. `GET /v1/storms`

Danh sách bão đang hoạt động.

**Input (query):**

| Param | Bắt buộc | Giá trị | Mặc định |
| --- | --- | --- | --- |
| `region` | Không | `all` / `us-nhc` / `gdacs` | `all` |

**Output 200:** `data` là **mảng**:

| Field | Kiểu | Đơn vị | Ghi chú |
| --- | --- | --- | --- |
| `stormId` | string | — | Dùng cho các endpoint khác |
| `name` | string | — | |
| `source` | `"nhc"` \| `"gdacs"` | — | |
| `basin` | string \| null | — | `null` với GDACS |
| `area` | `"PO"` \| `"AO"` \| `"IO"` \| `"SO"` \| `"AR"` | — | Vùng đại dương chuẩn hoá theo vị trí bão. |
| `lat` | number | độ | Vị trí tâm bão |
| `lon` | number | độ | |
| `datetime` | string | ISO UTC | Thời điểm của vị trí này |
| `windSpeed` | number \| null | **knot** | GDACS: là gió mạnh **nhất của cả event**, không phải hiện tại |
| `category` | string | — | Xem bảng ngưỡng |
| `message` | string \| null | — | Khuyến nghị an toàn theo Category 1–5; `null` nếu chưa đạt Category 1. |
| `alertLevel` | string \| null | — | Chỉ GDACS có |

```json
{ "ok": true, 
  "data": [
  { "stormId": "gdacs:TC:1001297:55", "name": "DOLPHIN-26", "source": "gdacs",
    "basin": null, "area": "PO", "lat": 27.9, "lon": 120.6,
    "datetime": "2026-08-09T12:00:00.000Z",
    "windSpeed": 145, "category": "category_5",
    "message": "Extreme danger. Leave immediately if ordered.", "alertLevel": "Orange" }
] }
```

`data: []` là **hợp lệ** khi không có bão nào. Rất thường gặp với `region=us-nhc` ngoài mùa bão Atlantic.

| Code | Khu vực |
| --- | --- |
| `PO` | Pacific Ocean |
| `AO` | Atlantic Ocean |
| `IO` | Indian Ocean |
| `SO` | Southern Ocean |
| `AR` | Arctic Region |

**Lỗi:** 400 khi `region` sai · 502 khi **tất cả** provider lỗi.

---

## `POST /v1/storms/tracking`

Trả dữ liệu card cho màn hình **Saved Storms**. FE tự lưu danh sách yêu thích và gửi các `stormId` cần hiển thị trong một request; API không lưu trạng thái follow theo thiết bị.

**Input (JSON body):**

```json
{ "stormIds": ["gdacs:TC:1001297:50", "nhc:EP072025"] }
```

`stormIds` bắt buộc có từ 1 đến 20 ID NHC hoặc GDACS hợp lệ. Thứ tự mảng `data` giữ nguyên thứ tự FE gửi.

**Output 200:** `data` là mảng card:

| Field | Kiểu | Ghi chú |
| --- | --- | --- |
| `requestedStormId` | string | ID FE đã gửi, dùng để đối chiếu item đã lưu. |
| `trackingId` | string | ID ổn định; GDACS bỏ `episodeId` cuối để nhận diện cùng một event. |
| `stormId` | string | ID hiện hành; với GDACS active có thể là episode mới hơn ID FE đã lưu. |
| `name`, `source` | string | Thông tin hiển thị card. |
| `area` | `"PO"` \| `"AO"` \| `"IO"` \| `"SO"` \| `"AR"` | Vùng đại dương chuẩn hoá theo vị trí mới nhất. |
| `status` | `"active"` \| `"dissipated"` | `active` nếu còn trong danh sách bão đang hoạt động; ngược lại tra historical track. |
| `category` | `1` \| `2` \| `3` \| `4` \| `5` \| null | Cường độ mới nhất. |
| `message` | string / null | Khuyến nghị an toàn tương ứng `category`. |
| `lat`, `lon`, `updatedAt` | number, string ISO UTC | Vị trí/thời điểm mới nhất. |
| `endedAt` | string ISO UTC \| null | `null` khi active; với historical là thời điểm quan sát chính thức cuối cùng, không phải thời điểm tan chính xác. |

```json
{ "ok": true,
  "data": [
    { "requestedStormId": "gdacs:TC:1001297:50", "trackingId": "gdacs:TC:1001297",
      "stormId": "gdacs:TC:1001297:51", "name": "DOLPHIN-26", "source": "gdacs",
      "area": "PO", "status": "active", "category": 5,
      "message": "Extreme danger. Leave immediately if ordered.", "lat": 27, "lon": 124.8,
      "updatedAt": "2026-08-08T12:00:00.000Z", "endedAt": null },
    { "requestedStormId": "nhc:EP072025", "trackingId": "nhc:EP072025",
      "stormId": "nhc:EP072025", "name": "EP072025", "source": "nhc",
      "area": "PO", "status": "dissipated", "category": 1,
      "message": "Secure loose items, check emergency supplies now", "lat": 15, "lon": -120,
      "updatedAt": "2025-08-03T00:00:00.000Z", "endedAt": "2025-08-03T00:00:00.000Z" }
  ]
}
```

**Lỗi:** 400 khi `stormIds` rỗng, quá 20 phần tử hoặc chứa ID sai; 404 khi bất kỳ ID nào không thể tra cứu; 502 khi provider lỗi.

---

## 3. `GET /v1/storms/{stormId}/track`

Đường đi đã quan sát + dự báo.

**Input (path):** `stormId` — nhận cả `nhc:` và `gdacs:TC:`.

**Output 200:**

| Field | Kiểu | Ghi chú |
| --- | --- | --- |
| `stormId`, `name` | string | |
| `source` | `"nhc"` \| `"gdacs"` | |
| `area` | `"PO"` \| `"AO"` \| `"IO"` \| `"SO"` \| `"AR"` | Vùng đại dương chuẩn hoá theo vị trí observed/forecast mới nhất. |
| `category` | `1` \| `2` \| `3` \| `4` \| `5` \| null | Cường độ hiện tại từ điểm observed mới nhất. `null` nếu chỉ là áp thấp/bão nhiệt đới hoặc provider không có cường độ. |
| `message` | string \| null | Khuyến nghị an toàn tương ứng `category`; `null` khi category là `null`. |
| `issuedAt` | string ISO UTC | Thời điểm bản tin |
| `cachedUntil` | string ISO UTC \| null | Cache 10 phút (tạm thời cho giai đoạn test) |
| `observed` | array | Điểm đã quan sát |
| `forecast` | array | Điểm dự báo |

Mỗi điểm trong `observed` / `forecast`:

| Field | Kiểu | Đơn vị |
| --- | --- | --- |
| `lat`, `lon` | number | độ |
| `datetime` | string | ISO UTC |
| `windSpeed` | number \| null | **knot** |
| `category` | `1` \| `2` \| `3` \| `4` \| `5` \| null | `null` nếu chưa đạt hurricane Category 1 hoặc provider không có cường độ |
| `message` | string \| null | Khuyến nghị an toàn tương ứng category |
| `forecastHour` | number | **giờ** kể từ `issuedAt` — **chỉ có trong `forecast`** |

```json
{ "ok": true, 
"data": {
  "stormId": "nhc:AL092025", "name": "Imelda", "source": "nhc",
  "area": "AO", "category": 1,
  "message": "Secure loose items, check emergency supplies now",
  "issuedAt": "2025-09-30T00:00:00.000Z",
  "cachedUntil": "2025-09-30T02:00:00.000Z",
  "observed": [
    { "lat": 27.4, "lon": -78.2, "datetime": "2025-09-30T00:00:00.000Z",
      "windSpeed": 55, "category": null, "message": null }
  ],
  "forecast": [
    { "lat": 29.1, "lon": -77.0, "datetime": "2025-09-30T12:00:00.000Z",
      "forecastHour": 12, "windSpeed": 65, "category": 1,
      "message": "Secure loose items, check emergency supplies now" }
  ]
} }
```

> **Với GDACS:** các điểm không có cường độ tại thời điểm đó trả `windSpeed: null`, `category: null`, `message: null`. Top-level `area` luôn là một trong 5 mã vùng chuẩn hoá, không phải danh sách quốc gia từ GDACS.

### `message` theo `category`

| Category | Message |
| --- | --- |
| `1` | Secure loose items, check emergency supplies now |
| `2` | Review evacuation route. Power outages likely |
| `3` | Major hurricane. Follow evacuation orders if issued |
| `4` | Catastrophic winds. Evacuate now if advised. |
| `5` | Extreme danger. Leave immediately if ordered. |

**Lỗi:** 400 `stormId` sai định dạng · 404 không có bão · 502 provider lỗi.

---

## 4. `GET /v1/storms/{stormId}/history-track`

Đường đi quá khứ (best track).

**Input (path):** `stormId` — NHC **chỉ basin AL/EP/CP**, hoặc `gdacs:TC:`.

**Output 200:**

| Field | Kiểu | Ghi chú |
| --- | --- | --- |
| `stormId`, `name` | string | |
| `source` | `"nhc"` \| `"gdacs"` | |
| `trackKind` | `"best_track"` \| `"gdacs_observed_track"` \| null | GDACS **không** phải best track chính thức |
| `availability` | `"available"` \| `"not_available"` | |
| `reason` | string | Chỉ xuất hiện khi `not_available` |
| `history` | array | Sort **tăng dần** theo `datetime` |
| `cachedUntil` | string ISO UTC \| null | Cache 10 phút (tạm thời cho giai đoạn test) |

Mỗi điểm `history`: `lat`, `lon` (độ), `datetime` (ISO UTC), `windSpeed` (**knot** \| null), `category`.

```json
{ "ok": true, 
  "data": {
    "stormId": "nhc:AL052025", "name": "AL052025", "source": "nhc",
    "trackKind": "best_track", "availability": "available",
    "cachedUntil": "2026-08-10T02:00:00.000Z",
    "history": [
      { "lat": 16.5, "lon": -23.1, "datetime": "2025-08-11T00:00:00.000Z",
        "windSpeed": 30, "category": "tropical_depression" }
    ]
  }
}

`availability: "not_available"` vẫn trả **200**, không phải lỗi.

> **Test data luôn có sẵn:** endpoint này đọc NHC archive nên có data cho **bão đã kết thúc**, không cần chờ có bão active. Xem [mục 12](#12-test-data-có-sẵn).

---

## 5. `GET /v1/storms/{stormId}/cone`

Vùng dự báo (cone) NHC, hoặc vùng ảnh hưởng GDACS.

**Input (path):** `stormId` — cả 2 dạng.

**Output 200:**

| Field          | Kiểu                  | Ghi chú |
| -------------- | --------------------- | ------- |
| `availability` | `"available"`         \| `"not_available"` \| `"not_supported"` | |
| `geometryKind` | `"forecast_cone"`     \| `"gdacs_event_area"` \| null | `gdacs_event_area` **không** phải cone dự báo chính thức |
| `geojson`      | GeoJSON               \| null | `Feature` (NHC) hoặc `FeatureCollection` (GDACS) |
| `issuedAt`, `cachedUntil` | string ISO UTC \| null | Cache 10 phút (tạm thời cho giai đoạn test) |
| `reason` | string | Khi không available |

`not_supported` = basin NHC ngoài AL/EP/CP. **Vẫn trả 200.**

Toạ độ trong `geojson` theo chuẩn GeoJSON: **`[lon, lat]`** — ngược thứ tự so với các field `lat`/`lon` ở nơi khác.

---

## 6. `GET /v1/storms/{stormId}/spaghetti`

Nhiều đường dự báo từ các model khí tượng.

**Input (path):** `stormId` — **chỉ NHC AL/EP/CP**. Truyền GDACS ID → **400**.

**Output 200:**

| Field | Kiểu | Ghi chú |
| --- | --- | --- |
| `cycleTime` | string ISO UTC \| null | Thời điểm chạy model |
| `availability` | `available` / `not_available` / `not_supported` | |
| `models` | array | `{ code, label, points[] }` |

`points[]`: `forecastHour` (**giờ**), `lat`, `lon` (độ), `windSpeed` (**knot** \| null).

FE vẽ một polyline cho mỗi phần tử `models[]`.

---

## 7. `GET /v1/weather/current`

Thời tiết hiện tại tại một điểm.

**Input (query):**

| Param | Bắt buộc | Giá trị | Mặc định |
| --- | --- | --- | --- |
| `lat` | **Có** | number, −90…90 | — |
| `lon` | **Có** | number, −180…180 | — |
| `units` | Không | `standard` / `metric` / `imperial` | `metric` |

Ảnh hưởng của `units`:

| `units` | `temperature` | `windSpeed` | `visibility` | `rain` |
| --- | --- | --- | --- | --- |
| `standard` | **K** | **m/s** | m | mm/h |
| `metric` (mặc định) | **°C** | **m/s** | m | mm/h |
| `imperial` | **°F** | **mph** | m | mm/h |

**Output 200:**

| Field | Kiểu | Đơn vị |
| --- | --- | --- |
| `location` | object | `{ lat, lon, timezone }` — `timezone` dạng IANA, có thể `null` |
| `units` | object | Chính là bảng trên, FE nên đọc từ đây thay vì hardcode |
| `observedAt` | string | ISO UTC |
| `cachedUntil` | string \| null | ISO UTC (cache 10 phút) |
| `temperature` | number \| null | theo `units.temperature` |
| `humidity` | number \| null | **%** |
| `uvi` | number \| null | chỉ số UV |
| `visibility` | number \| null | **mét** |
| `windSpeed` | number \| null | theo `units.windSpeed` |
| `windDeg` | number \| null | **độ 0–360** |
| `windDirection` | string \| null | `N`…`NNW` |
| `rain1h` | number \| null | **mm**, `null` khi không mưa |
| `precipitationProbability` | number \| null | **0–1** |
| `weatherDescription` | string \| null | Mô tả tiếng Anh |
| `weather` | array | `{ id, main, description, icon }` |

```json
{ "ok": true, "data": {
  "location": { "lat": 10.8231, "lon": 106.6297, "timezone": "Asia/Ho_Chi_Minh" },
  "units": { "temperature": "C", "windSpeed": "m/s", "visibility": "m", "rain": "mm/h" },
  "observedAt": "2026-08-09T01:39:20.000Z",
  "cachedUntil": "2026-08-09T01:49:20.000Z",
  "temperature": 30.03, "humidity": 78, "uvi": 5.21, "visibility": 10000,
  "windSpeed": 6.63, "windDeg": 251, "windDirection": "WSW",
  "rain1h": 0.14, "precipitationProbability": 0.79,
  "weatherDescription": "light rain",
  "weather": [{ "id": 500, "main": "Rain", "description": "light rain", "icon": "10d" }]
} }
```

FE dùng `weather[0].icon` để hiển thị icon: `01d`/`01n` (trời quang ngày/đêm), `10d` (mưa)... URL icon: `https://openweathermap.org/img/wn/{icon}@2x.png`

**Lỗi:**

- `400` khi `lat` hoặc `lon` bị thiếu/rỗng: `Query params 'lat' and 'lon' are required.`
- `400` khi một trong hai toạ độ không phải số thập phân hợp lệ hoặc ngoài phạm vi: `Query params 'lat' and 'lon' must be valid decimal coordinates.`
- `400` khi `units` không hợp lệ · `502` khi OpenWeather lỗi.

---

## 8. `GET /v1/weather/forecast`

Dự báo theo giờ và theo ngày.

**Input (query):** giống mục 7 (`lat`, `lon`, `units`).

**Output 200:**

| Field | Kiểu | Ghi chú |
| --- | --- | --- |
| `location`, `units` | object | Như mục 7 |
| `cachedUntil` | string \| null | ISO UTC (cache 20 phút — tạm thời cho giai đoạn test) |
| `hourly` | array | **~48 điểm**, mỗi điểm cách 1 giờ |
| `daily` | array | **10 điểm**, mỗi điểm 1 ngày |

Mỗi điểm trong `hourly` / `daily`:

| Field | Kiểu | Đơn vị |
| --- | --- | --- |
| `time` | string | ISO UTC |
| `temp` | number \| null | theo `units.temperature`. Với `daily` là nhiệt độ **ban ngày** |
| `humidity` | number \| null | **%** |
| `uvi` | number \| null | chỉ số UV |
| `visibility` | number \| null | **mét** — `daily` thường `null` |
| `windSpeed` | number \| null | theo `units.windSpeed` |
| `windDeg` | number \| null | **độ 0–360** |
| `windDirection` | string \| null | `N`…`NNW` |
| `pop` | number \| null | **0–1** — `daily` thường `null` |
| `rain1hMm` | number \| null | **mm** — **chỉ `hourly` có**, `daily` luôn `null` |
| `weather` | array | `{ id, main, description, icon }` |

**Lỗi:** 400 · 502.

---

## 9. `GET /v1/map-tiles/{layer}/{z}/{x}/{y}`

Tile ảnh bản đồ. **Trả PNG, không phải JSON.**

**Input (path):**

| Param | Giá trị | Ghi chú |
| --- | --- | --- |
| `layer` | `windSpeed` / `temperature` / `pressure` / `precipitation` | `windSpeed` = layer gió |
| `z` | Số nguyên **2–7** | Zoom level |
| `x` | Số nguyên `0 … 2^z − 1` | z=2 → 0…3 · z=7 → 0…127 |
| `y` | Số nguyên `0 … 2^z − 1` | |

**Output 200:** body là ảnh, header `Content-Type: image/png`. Cache 20 phút (tạm thời cho giai đoạn test).

FE dùng trực tiếp URL này làm tile source:

```
https://project3.vuonghieu.site/v1/map-tiles/temperature/{z}/{x}/{y}
```

Ví dụ: `GET /v1/map-tiles/pressure/5/25/15`

**Lỗi (JSON):** 400 `layer` sai · 400 `z` ngoài 2–7 · 400 `x`/`y` ngoài lưới · 502.

---

## 10. `GET /v1/radar`

Manifest radar RainViewer để FE tự ghép tile.

**Input:** không.

**Output 200:**

| Field | Kiểu | Ghi chú |
| --- | --- | --- |
| `source` | string | `"rainviewer"` |
| `attribution`, `attributionUrl` | string | **Bắt buộc hiển thị** theo điều khoản RainViewer |
| `host` | string | |
| `tileTemplate` | string | Thay `{path}`, `{z}`, `{x}`, `{y}` |
| `past` | array | `{ time, path }` — frame quá khứ, cách nhau ~10 phút |
| `nowcast` | array | `{ time, path }` — dự báo ngắn, **có thể là `[]`** |
| `generatedAt` | string | ISO UTC |
| `cachedUntil` | string \| null | ISO UTC (cache 20 phút — tạm thời cho giai đoạn test) |

`time` trong `past`/`nowcast` là **ISO UTC**. Cách dùng:

```js
const url = data.tileTemplate
    .replace("{path}", data.past.at(-1).path)   // frame mới nhất
    .replace("{z}", z).replace("{x}", x).replace("{y}", y);
```

---

## 11. Device & Subscription (cần MongoDB)

Chưa có authentication: `deviceToken` chính là danh tính thiết bị. **`deviceToken` không bao giờ được trả lại trong response.**

`deviceToken` = chuỗi **hex**, độ dài **64–200 ký tự**.

### `POST /v1/devices`

```json
{ "deviceToken": "a1b2c3..." }
```

**Output 200:**

| Field | Kiểu | Ghi chú |
| --- | --- | --- |
| `registered` | `true` | Luôn `true` khi thành công |
| `alreadyRegistered` | boolean | `true` = token đã tồn tại trước đó |

Idempotent — gọi lại **không** tạo bản ghi trùng và **không** phải lỗi.

### `POST /v1/storm-subscriptions`

```json
{ "deviceToken": "a1b2c3...", "stormId": "nhc:AL092025" }
```

**Output 200:** `{ "stormId": "...", "subscribed": true, "alreadySubscribed": false }`

### `POST /v1/storm-subscriptions/unsubscribe`

Body giống trên. **Output 200:** `{ "stormId": "...", "subscribed": false, "removed": true }`

`removed: false` = vốn không theo dõi. Vẫn trả **200**.

### `PUT /v1/region-subscriptions`

```json
{ "deviceToken": "a1b2c3...", "lat": 10.8231, "lon": 106.6297, "radiusKm": 300 }
```

| Field | Bắt buộc | Kiểu | Đơn vị / Ràng buộc |
| --- | --- | --- | --- |
| `deviceToken` | Có | string | hex 64–200 ký tự |
| `lat` | Có | **number** | **độ**, −90…90. Truyền string → 400 |
| `lon` | Có | **number** | **độ**, −180…180 |
| `radiusKm` | Có | **number** | **km**, 1–2000 |

**Output 200:** `{ "lat": 10.8231, "lon": 106.6297, "radiusKm": 300, "saved": true }`

Mỗi device có **một** vùng — gọi lại là **ghi đè**.

### Loại alert tự động

Scheduler gửi push cho device theo dõi bão hoặc nằm trong vùng đã đăng ký. `type` nội bộ của alert dùng các giá trị ổn định sau:

| `type` | Nhãn hiển thị | Điều kiện |
| --- | --- | --- |
| `new_storm` | New storm | Phát hiện cơn bão active lần đầu. |
| `track_change` | Track change | Hướng di chuyển đổi từ 45° trở lên. |
| `category_change` | Category change | Category cường độ thay đổi. |
| `alert_level_change` | Alert level change | GDACS Green/Orange/Red thay đổi. |
| `watch_warning` | Watch/Warning | NHC phát hành hoặc cập nhật Storm Surge Watch/Warning advisory. |
| `storm_dissipated` | Storm dissipated | Cơn bão không còn trong danh sách active. |

Với alert tự động, APNs custom payload đính kèm `{ "type", "stormId", "trackingId" }` để FE mở đúng màn hình bão. `POST /v1/notifications/send` là push thủ công nên chỉ đính kèm `stormId` / `type` khi request có gửi field tương ứng (không có `trackingId`).

### `POST /v1/notifications/send`

| Field | Bắt buộc | Ràng buộc |
| --- | --- | --- |
| `deviceToken` | Có | hex 64–200 ký tự |
| `title` | Có | không rỗng, ≤ **256** ký tự |
| `description` | Có | không rỗng, ≤ **2048** ký tự |
| `stormId` | Không | `nhc:XX######` hoặc `gdacs:TC:<eventId>:<episodeId>`. Gửi kèm thì APNs custom payload có `stormId` để FE mở đúng màn hình bão. |
| `type` | Không | Một trong 6 giá trị alert ở bảng mục 11: `new_storm`, `category_change`, `track_change`, `alert_level_change`, `watch_warning`, `storm_dissipated`. Giá trị khác → 400 `BAD_REQUEST`. |

**Output 200:** `{ "title": "...", "description": "...", "sent": true, "stormId": "nhc:EP072026", "type": "new_storm" }` — `stormId` và `type` **luôn có trong response**, bằng `null` khi request không gửi kèm.

**Lỗi:** 400 `INVALID_DEVICE_TOKEN` (token giả hoặc APNs từ chối) · 502 `PUSH_UNAVAILABLE` · 503 `PUSH_NOT_CONFIGURED`.

---

## 12. Nguồn dữ liệu & data test cho từng API

### 12.1 Bảng tổng hợp

| API | Nguồn dữ liệu | Điều kiện có data | ID test đã verify |
| --- | --- | --- | --- |
| `/health` | Chính app | **Luôn có** | — |
| `/v1/storms` | NHC `CurrentStorms.json` + GDACS `geteventlist` | Phải có bão **đang hoạt động** | Fixture mode: luôn có data, xem mục 12.3 |
| `/track` | NHC KMZ forecast track / GDACS `getgeometry` | Bão phải **đang active** | Fixture mode: luôn có data, mục 12.3 |
| `/cone` | NHC KMZ cone / GDACS `getgeometry` | Bão phải **đang active** | Fixture mode: luôn có data, mục 12.3 |
| `/spaghetti` | NHC A-deck `ftp.nhc.noaa.gov/atcf/aid_public` | Bão trong **mùa hiện tại** | `nhc:AL012026`, `nhc:AL022026` |
| `/history-track` | NHC B-deck `atcf/archive/{year}` / GDACS | Bão của **mùa trước** | `nhc:AL052025`, `nhc:AL092025`, `nhc:EP032025` |
| `/weather/current` | OpenWeather One Call 4.0 | **Luôn có**, mọi lat/lon | — |
| `/weather/forecast` | OpenWeather One Call 4.0 | **Luôn có** | — |
| `/map-tiles/...` | OpenWeather tile | **Luôn có** | — |
| `/radar` | RainViewer | **Luôn có** | — |
| `/v1/devices`, subscription | MongoDB (tự tạo) | Cần Mongo connected | Tự tạo token hex 64 ký tự |
| `/notifications/send` | APNs | Cần device token thật từ app iOS | — |


### 12.3 Fixture mode — data bão luôn có cho staging/test

Khi cần FE/QA test ổn định, không phụ thuộc mùa bão hay upstream, cấu hình:

```bash
STORM_DATA_MODE=fixture
```

Sau khi restart, các API storm sau luôn có dữ liệu local, dựa trên các profile bão thật/lịch sử: `/v1/storms`, `/track`, `/cone`, `/history-track`, `GET /v1/storms/demo` và `POST /v1/storms/tracking`. Các `stormId` fixture ổn định để FE có thể subscribe và test luồng detail:

```text
nhc:AL022026         active, tropical storm
nhc:EP072026         active, category 3
gdacs:TC:1001297:51  active, category 5
nhc:EP032025         historical, dissipated
```

Fixture mode phủ luôn `/spaghetti` và weather, dữ liệu **đồng bộ với 3 bão fixture**:

| API | Data fake |
| --- | --- |
| `/v1/storms/:stormId/spaghetti` | 3 model `AVNO`, `AEMN`, `NVGM` cho `nhc:AL022026` và `nhc:EP072026`; mỗi model 5 điểm (`forecastHour` 12/24/36/48/72) toả ra từ tâm bão. `stormId` NHC khác → `not_available`; `gdacs:*` → `not_supported`. |
| `/v1/weather/current` | Tọa độ **trong bán kính 400 km** quanh một bão fixture trả thời tiết bão (`Thunderstorm`, gió theo đúng `windSpeed` của bão đó, mưa lớn, tầm nhìn giảm, `pop` tới 1). Ngoài bán kính trả ngày quang mây. |
| `/v1/weather/forecast` | 48 điểm `hourly` (cách 1 giờ) + 10 điểm `daily` (12:00 UTC mỗi ngày), cùng công thức với `/weather/current` nên 2 API luôn khớp nhau. |

Ví dụ: gọi `/v1/weather/current?lat=19.4&lon=-116.6` (tâm `nhc:EP072026`) sẽ ra gió ~51 m/s đúng với cấp 3 của bão đó trong `/v1/storms`. Data không phụ thuộc đồng hồ ngoài mốc giờ, cùng input luôn ra cùng output → chụp snapshot UI ổn định. Fixture weather không cần `OPENWEATHER_API_KEY`.

Đổi lại dữ liệu thật chỉ cần `STORM_DATA_MODE=live` rồi restart API. Scheduler alert tự động được tắt trong fixture mode để không gửi push notification giả tới người dùng thật. Map tile và radar vẫn dùng upstream riêng (luôn có data, không phụ thuộc mùa bão).

### 12.4 Data luôn có — test được ngay

```bash
BASE=https://project3.vuonghieu.site

# Bão đang hoạt động (GDACS thường có quanh năm ở Tây Bắc Thái Bình Dương)
curl -s "$BASE/v1/storms"

# Lấy stormId từ response trên rồi dùng cho track / cone / history
curl -s "$BASE/v1/storms/gdacs:TC:1001297:55/track"
curl -s "$BASE/v1/storms/gdacs:TC:1001297:55/cone"

# History track bão NHC mùa 2025 — luôn có, không cần bão active
curl -s "$BASE/v1/storms/nhc:AL052025/history-track"    # 68 điểm
curl -s "$BASE/v1/storms/nhc:AL092025/history-track"    # 38 điểm
curl -s "$BASE/v1/storms/nhc:EP032025/history-track"    # 15 điểm

# Spaghetti bão NHC mùa 2026 — A-deck còn trong aid_public
curl -s "$BASE/v1/storms/nhc:AL012026/spaghetti"        # 3 model: AEMN, AVNO, NVGM
curl -s "$BASE/v1/storms/nhc:AL022026/spaghetti"        # 2 model: AEMN, AVNO

# Không phụ thuộc bão
curl -s "$BASE/v1/weather/current?lat=10.8231&lon=106.6297"
curl -s "$BASE/v1/weather/forecast?lat=10.8231&lon=106.6297"
curl -s -o tile.png -w "%{http_code} %{content_type}\n" "$BASE/v1/map-tiles/temperature/5/25/15"
curl -s "$BASE/v1/radar"
```

Danh sách bão NHC dùng được cho **history-track**: đổi số trong `nhc:AL{NN}2025` với NN = 01…13, `nhc:EP{NN}2025` với NN = 01…05+, `nhc:CP{NN}2025` với NN = 01…02.
Xem danh sách đầy đủ: <https://ftp.nhc.noaa.gov/atcf/archive/2025/>

Danh sách bão dùng được cho **spaghetti**: xem <https://ftp.nhc.noaa.gov/atcf/aid_public/> — file `a{basin}{NN}{year}.dat.gz` nào có ở đó thì `nhc:{BASIN}{NN}{YEAR}` gọi được.

### 12.5 Giả lập bão NHC đang active để test `/track` và `/cone`

`/track` và `/cone` **chỉ** đọc từ danh sách bão active. Ngoài mùa bão thì không có gì để test. Cách giả lập: trỏ app vào một snapshot NHC đã lưu trữ.

Thêm vào `.env` trên server rồi restart:

```bash
NHC_CURRENT_STORMS_URL=https://www.nhc.noaa.gov/archive/activeJson/2025/CurrentStorms_2025-09-30-0142.json
```

```bash
docker compose restart api
```

Kết quả (đã test thật):

```
/v1/storms?region=us-nhc     -> 2 bão: Humberto (120 kt, category_4), Imelda (55 kt, tropical_storm)
/nhc:AL092025/track          -> observed 1 điểm + forecast 8 điểm, windSpeed 55 kt
/nhc:AL092025/cone           -> availability=available, geometryKind=forecast_cone, có geojson
```

**Lưu ý khi bật override:**

| | |
| --- | --- |
| `/history-track` sẽ **hỏng** (502) | Vì bão nằm trong danh sách active nên app đi đường `bestTrackGIS` (KMZ đã bị NHC xoá) thay vì đường archive |
| `/spaghetti` trả `not_available` | A-deck của bão cũ đã bị xoá khỏi `aid_public` |

Nên bật override **chỉ khi** cần test track/cone. Xong thì xoá dòng đó và restart lại.

Tìm snapshot khác có bão: liệt kê <https://www.nhc.noaa.gov/archive/activeJson/2025/> rồi chọn file ngày có bão. Nhiều file trả `activeStorms: 0` — phải chọn đúng ngày.

### 12.5 Nguồn provider gốc — tra trực tiếp khi cần đối chiếu

| Provider | URL | Dùng cho |
| --- | --- | --- |
| NHC active storms | <https://www.nhc.noaa.gov/CurrentStorms.json> | `/v1/storms`, `/track`, `/cone` |
| NHC snapshot cũ | <https://www.nhc.noaa.gov/archive/activeJson/> | Giả lập bão active |
| NHC B-deck archive | <https://ftp.nhc.noaa.gov/atcf/archive/> | `/history-track` (mùa trước) |
| NHC B-deck mùa hiện tại | <https://ftp.nhc.noaa.gov/atcf/btk/> | Xem mục 12.6 |
| NHC A-deck | <https://ftp.nhc.noaa.gov/atcf/aid_public/> | `/spaghetti` |
| GDACS event list | <https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC> | `/v1/storms` (GDACS) |
| GDACS event data | `.../geteventdata?eventtype=TC&eventid=&episodeid=` | `/track`, `/history-track` (GDACS) |
| GDACS geometry | `.../polygons/getgeometry?eventtype=TC&eventid=&episodeid=` | `/cone`, các điểm track GDACS |
| RainViewer | <https://api.rainviewer.com/public/weather-maps.json> | `/radar` |

Muốn biết GDACS đang có bão nào đang hoạt động:

```bash
curl -s "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC" \
  | grep -o '"eventid":[0-9]*,"episodeid":[0-9]*' | head
```

### 12.6 ⚠️ Hạn chế đã biết: history-track của bão mùa hiện tại

`/history-track` chỉ tìm B-deck ở `atcf/archive/{year}/b{...}.dat.gz`. NHC **chỉ** đưa file vào thư mục archive **khi hết mùa bão**. Bão của mùa đang diễn ra nằm ở `atcf/btk/b{...}.dat` (không nén, không có thư mục năm).

Kết quả: bão mùa hiện tại luôn trả `availability: "not_available"` dù dữ liệu có tồn tại.

Ví dụ với `nhc:EP072026`:

| | |
| --- | --- |
| App gọi | `https://ftp.nhc.noaa.gov/atcf/archive/2026/bep072026.dat.gz` → **404** |
| Dữ liệu thật nằm ở | `https://ftp.nhc.noaa.gov/atcf/btk/bep072026.dat` → **200, 91 dòng** |

Format hai file **giống nhau hoàn toàn**, parser hiện tại đọc được cả hai. Chỉ thiếu bước thử `btk/` trước khi thử `archive/`.

Trong khi chờ sửa, dùng bão **mùa 2025** để test history-track (mục 12.4).

---
