# ALERT.md

Tài liệu thiết kế nghiệp vụ **Storm Alert** cho `soosky-storm-api`.

---

## 1. Mục tiêu

Khi một cơn bão thay đổi (mới xuất hiện, tăng/giảm cấp, đổi hướng, tan…), hệ thống phải:

```text
Storm thay đổi
      ↓
Backend phát hiện
      ↓
Tạo StormAlert
      ↓
Lưu StormAlert vào database
      ↓
FE lấy alerts theo danh sách storm đang tracking
      ↓
Push notification chỉ là bước tuỳ chọn
```

Ba điều bắt buộc phải đạt:

1. **Alert phải được lưu lại.** Không còn chuyện alert chỉ tồn tại trong bộ nhớ rồi biến mất.
2. **Alert phải xem được trong app kể cả khi user không cấp quyền notification.**
3. **Push notification thất bại không được làm mất alert.**

---

## 2. Vấn đề hiện tại

Code hiện tại nằm ở `src/domain/use-cases/alert/DetectStormAlertsUseCase.ts`. Luồng thật đang chạy:

```text
setInterval (mặc định 15 phút, startAlertScheduler.ts)
   ↓
DetectStormAlertsUseCase.execute()
   ↓
lấy active storms + đọc bảng storm_states
   ↓
detectChanges() → StormAlert[]   ← chỉ nằm trong RAM
   ↓
_deliver(): tìm device đang follow / device trong bán kính
   ↓
claimDelivery(deviceToken, alertKey)   ← chống trùng
   ↓
gửi APNs
   ↓
_persist(): lưu storm_states
```

Bốn vấn đề:

**(1) Alert không được lưu.** `StormAlert` (`src/domain/entities/alert/StormAlert.ts`) chỉ là object trong bộ nhớ, sống đúng một chu kỳ scheduler rồi bị bỏ. Không có collection nào chứa `title`, `description`, thời điểm xảy ra.

**(2) Bảng `alert_deliveries` không phải là lịch sử alert.** Nó chỉ lưu `{deviceToken, alertKey, stormId}` (`src/adapters/mongo/models.ts:62-75`) — đủ để biết "đã gửi cho máy này rồi", không đủ để hiển thị bất cứ thứ gì. Tệ hơn, các dòng này bị **xoá sạch** khi bão tan (`DetectStormAlertsUseCase.ts:141`).

**(3) Alert bị trói vào thiết bị.** Người nhận được xác định qua `deviceToken`. Mà `deviceToken` là token APNs — iOS chỉ cấp sau khi user bấm "Allow". User bấm "Don't Allow" ⇒ không có token ⇒ không đăng ký được thiết bị ⇒ không subscribe được ⇒ **không nhận được gì, kể cả trong app**.

**(4) Detect và Push dính vào nhau.** Cùng một hàm `_deliver()` vừa chống trùng, vừa dựng nội dung, vừa gọi APNs. Push hỏng thì alert coi như chưa từng tồn tại.

---

## 3. Nguyên tắc thiết kế mới

**Nguyên tắc 1 — Alert là dữ liệu, Push là kênh gửi.**

```text
Alert  ≠  Push Notification
```

Alert là một sự kiện nghiệp vụ có thật, được lưu vào database. Push chỉ là một cách đẩy sự kiện đó ra ngoài app.

**Nguyên tắc 2 — Alert thuộc về storm, không thuộc về người dùng.**

Bão Erin lên cấp 3 là một sự thật khách quan. Nó xảy ra dù có ai đang mở app hay không. Vì vậy bảng `storm_alerts` **không được có** bất kỳ field nào trong nhóm: `userId`, `deviceId`, `deviceToken`, `installationId`, `UUID`.

**Nguyên tắc 3 — Frontend quyết định "của ai".**

FE tự lưu danh sách storm user đang theo dõi. Khi mở màn hình Alerts, FE gửi danh sách đó lên, BE lọc và trả về. Backend không cần biết user là ai.

**Nguyên tắc 4 — Push không bao giờ được làm hỏng Detect.**

Thứ tự bắt buộc: **lưu alert trước, gửi push sau**. Lỗi APNs chỉ được log, không được rollback, không được ném ra khỏi chu kỳ.

**Nguyên tắc 5 — Không over-engineering.**

Giữ nguyên logic so sánh đang chạy tốt. Không thêm queue, không thêm event bus, không thêm bảng nếu chưa có use case rõ ràng.

---

## 4. Storm Alert là gì?

**Storm Alert** = một bản ghi mô tả *một thay đổi cụ thể* của một cơn bão, tại một thời điểm cụ thể.

Ví dụ:

```text
Lần scan trước:   Erin — Category 2
Lần scan này:     Erin — Category 3

⇒ sinh ra 1 StormAlert:

   type          = category_change
   previousValue = category_2
   currentValue  = category_3
   title         = "Erin strengthened"
   description   = "Erin strengthened from Category 2 to Category 3."
   createdAt     = 2026-08-21T03:42:00.000Z
```

Bản ghi này:

- tồn tại độc lập với mọi thiết bị;
- không bao giờ bị sửa (immutable — ghi một lần, không update);
- không bị xoá khi bão tan.

> **persistence** (lưu trữ bền): dữ liệu được ghi xuống database và còn nguyên sau khi process restart. Alert hiện tại *không* có persistence — đây chính là thứ cần thêm.

---

## 5. Alert khác Push Notification như thế nào?

```text
                    Storm thay đổi
                          │
                          ▼
                   Create StormAlert
                          │
                          ▼
                   Save vào storm_alerts        ← BẮT BUỘC, luôn xảy ra
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
      In-app Alerts           Push Notification    ← TUỲ CHỌN
      (POST /v1/alerts/query)  (APNs)
              │                       │
       luôn hoạt động        chỉ khi thiết bị:
                             • đã cấp quyền notification
                             • đã đăng ký deviceToken
```

Bảng so sánh:

| | Storm Alert | Push Notification |
|---|---|---|
| Bản chất | Dữ liệu nghiệp vụ | Kênh gửi |
| Lưu ở đâu | `storm_alerts` | Không lưu (chỉ log) |
| Gắn với | Một cơn bão | Một thiết bị |
| Cần quyền notification? | **Không** | Có |
| Thất bại thì sao? | Chu kỳ coi như lỗi, retry lần sau | Chỉ log, bỏ qua |

Trường hợp user từ chối quyền notification:

```text
In-app Alert        = vẫn hoạt động bình thường
Push Notification   = không gửi
```

---

## 6. Dữ liệu cần lưu

### 6.1. Collection `storm_alerts` (mới)

```text
storm_alerts

  _id             string    ← TỰ ĐẶT, không dùng ObjectId — xem mục 9.3

  trackingId      string    ← khoá để query, đã bỏ hậu tố episode
  stormId         string    ← id gốc từ provider tại thời điểm alert
  stormName       string

  type            string    ← một trong 6 alert type
  previousValue   string|null
  currentValue    string|null

  lat             number
  lon             number
  windSpeed       number|null   ← knot
  category        string|null

  title           string
  description     string

  observedAt      string    ← mốc quan trắc của provider (ISO)
  createdAt       Date      ← lúc backend ghi bản ghi này
```

Phân biệt hai mốc thời gian:

| | Ý nghĩa | Nguồn |
|---|---|---|
| `observedAt` | Bản tin/quan trắc của provider ghi nhận trạng thái này lúc nào | `StormSummary.datetime` |
| `createdAt` | Backend phát hiện và ghi lúc nào | `_now()` của chu kỳ scheduler |

`observedAt` là thành phần của `_id` nên bắt buộc phải có. Nó cũng hữu ích cho FE: hai mốc này lệch nhau tối đa một chu kỳ scheduler, và `observedAt` mới là thời điểm "sự thật" xảy ra.

### 6.2. Vì sao cắt bớt field so với đề xuất ban đầu

Đề xuất ban đầu có thêm `alertLevel`, `watchWarning`, `direction`. Đối chiếu với `detectChanges()` (`DetectStormAlertsUseCase.ts:146-173`) thì ba field này **chính là** `currentValue` của từng loại alert — lưu thêm là trùng dữ liệu:

| type | previousValue | currentValue |
|---|---|---|
| `new_storm` | `null` | `null` |
| `category_change` | `previous.category` | `storm.category` |
| `alert_level_change` | `previous.alertLevel` | `storm.alertLevel` |
| `watch_warning` | `previous.watchWarning` | `storm.watchWarning` |
| `track_change` | hướng la bàn cũ | hướng la bàn mới |
| `storm_dissipated` | `null` | `null` |

⇒ **Bỏ** `alertLevel`, `watchWarning`, `direction` khỏi schema.

Còn `lat`, `lon`, `windSpeed`, `category` thì **giữ**, vì FE cần chúng để render item trong list (chấm trên map, badge cấp bão, tốc độ gió) mà không phải gọi thêm API storm. Đây là *snapshot* — ảnh chụp trạng thái bão tại lúc alert xảy ra, không phải dữ liệu realtime.

### 6.3. Index

```text
{ trackingId: 1, createdAt: -1 }
```

Đúng một index phụ. Nó phục vụ chính xác câu query duy nhất của API: lọc theo danh sách `trackingId`, sắp xếp `createdAt` giảm dần.

`_id` (tự đặt, mục 9.3) đã là primary key nên tự có index — không cần khai báo thêm.

**Không đặt unique index nào khác** — lý do ở mục 9.2.

### 6.4. Entity `StormAlert` sẽ đổi

File `src/domain/entities/alert/StormAlert.ts` hiện có:

```ts
interface StormAlert {
    type, trackingId, stormId, stormName,
    signature,                                  // ← bỏ
    lat, lon, windSpeed, category,
    alertLevel, watchWarning, direction,        // ← bỏ
}
```

Thay `signature` bằng cặp `previousValue` / `currentValue`, thêm `id`, `observedAt` và `createdAt`. `STORM_ALERT_TYPES` giữ nguyên (đang được `Server.ts:645-657` dùng để validate).

### 6.5. `storm_states` thêm đúng một field

Vai trò không đổi (mục 7.3), nhưng cần thêm `datetime` — mốc quan trắc của bản tin gần nhất:

```ts
interface StormState {
    trackingId, stormId, name,
    lat, lon, windSpeed, category, alertLevel, watchWarning, bearing,
    datetime: string;          // ← thêm, ISO. Lấy từ StormSummary.datetime
}
```

Hai lý do:

1. **Cần cho `_id` của alert `storm_dissipated`.** Alert này sinh từ `StormState` chứ không từ `StormSummary`, nên không có nguồn `observedAt` nào khác. Chi tiết ở mục 9.3.
2. **Vốn dĩ thiếu.** `storm_states` là ảnh chụp của quan trắc cuối cùng mà lại không lưu mốc thời gian của chính quan trắc đó.

Cập nhật cả `src/adapters/mongo/models.ts:45-60` và `toStormState()` trong `MongoStormStateRepository.ts:32-45`. Ngoài field này, không đổi gì khác.

Dòng cũ đã tồn tại trong database sẽ thiếu `datetime`. Không cần backfill: `toStormState` map thành `null`, và chu kỳ scheduler kế tiếp ghi đè giá trị thật.

---

## 7. Flow phát hiện thay đổi

### 7.1. Sơ đồ

```text
Scheduler (setInterval, mặc định 15 phút)
   ↓
Lấy active storms từ provider (NHC / GDACS)
   ↓
Đọc toàn bộ storm_states (trạng thái lần scan trước)
   ↓
Với mỗi storm: so sánh current vs previous
   ↓
Có thay đổi?
   │
   ├── Không ──→ bỏ qua, không tạo gì
   │
   └── Có
         ↓
     Tạo StormAlert (kèm title/description)
         ↓
     Lưu vào storm_alerts          ← BƯỚC NÀY TRƯỚC
         ↓
     Update storm_states           ← BƯỚC NÀY SAU
         ↓
     (tuỳ chọn) đẩy push — mục 11
```

### 7.2. Ví dụ cụ thể

```text
storm_states trước khi scan:

   trackingId = nhc:AL012026
   name       = Erin
   category   = category_2

Provider trả về:

   stormId    = nhc:AL012026
   name       = Erin
   category   = category_3

Backend so sánh:  category_2 ≠ category_3  ⇒ có thay đổi

Tạo storm_alerts:

   trackingId    = nhc:AL012026
   type          = category_change
   previousValue = category_2
   currentValue  = category_3
   title         = "Erin strengthened"
   description   = "Erin strengthened from Category 2 to Category 3."
   createdAt     = now

Update storm_states:

   category = category_3
```

Chu kỳ sau, nếu Erin vẫn `category_3` thì `category_3 === category_3` ⇒ không sinh alert.

### 7.3. Vai trò của `storm_states`

`storm_states` có **đúng một** nhiệm vụ:

```text
ghi nhớ trạng thái bão ở lần scan trước, để lần scan sau biết cái gì đã đổi
```

Nó **không phải** là nơi lưu lịch sử. Mỗi `trackingId` chỉ có đúng một dòng, bị ghi đè mỗi chu kỳ bằng `updateOne(..., { upsert: true })` (`MongoStormStateRepository.ts:20-25`).

Lịch sử thay đổi nằm ở `storm_alerts`, và chỉ ở đó.

### 7.4. Thứ tự ghi và rủi ro

> **Đây hoàn toàn là chuyện của backend. Frontend không liên quan gì.**
>
> "Thứ tự ghi" ở đây là thứ tự của hai lệnh ghi database **bên trong một chu kỳ scheduler chạy trên server**. FE không tham gia vào chu kỳ đó, không gọi API nào, và không thể ảnh hưởng đến kết quả.

Một chu kỳ có đúng hai lệnh ghi, vào hai collection khác nhau:

```text
A.  insertMany(storm_alerts)     ← lưu alert vừa phát hiện
B.  updateOne(storm_states)      ← cập nhật trạng thái để chu kỳ sau so sánh
```

Mongo ở cấu hình hiện tại không có transaction đa collection (muốn có phải chạy replica set), nên luôn tồn tại một khe hở giữa A và B. Nếu process chết đúng lúc đó:

| Thứ tự | Chết giữa A và B | Hậu quả |
|---|---|---|
| **A → B** | alert đã lưu, state vẫn `category_2` | Chu kỳ sau so `category_2` vs `category_3` ⇒ tạo lại alert ⇒ **trùng 1 bản** |
| B → A | state đã `category_3`, alert chưa lưu | Chu kỳ sau so `category_3` vs `category_3` ⇒ không thấy gì ⇒ **mất alert vĩnh viễn** |

Mất tệ hơn trùng, nên bắt buộc chọn **A → B**: `storm_alerts` trước, `storm_states` sau.

Còn cái trùng thì xử lý được — bằng `_id` xác định, mục 9.3.

### 7.5. Bão tan (`storm_dissipated`)

Logic hiện tại ở `DetectStormAlertsUseCase.ts:59-63`: mọi `storm_states` không còn xuất hiện trong danh sách active ⇒ coi là đã tan. Giữ nguyên. Nhưng đổi phần dọn dẹp:

| | Hiện tại | Thiết kế mới |
|---|---|---|
| Xoá `storm_states` | Có | Có — giữ nguyên |
| Xoá `alert_deliveries` | Có | **Bỏ** — mục 14 |
| Xoá `storm_alerts` | — | **Không bao giờ** |

Alert của bão đã tan vẫn nằm trong lịch sử. Đó là điểm mấu chốt của việc lưu alert.

---

## 8. Các loại Alert

Giữ nguyên cả 6 type đang có. Không thêm, không bớt.

Tất cả so sánh dưới đây đều dựa trên `previous` = một dòng `storm_states`, `current` = storm vừa lấy từ provider.

### 8.1. `new_storm`

| | |
|---|---|
| **Trigger** | Không tìm thấy dòng `storm_states` nào có `trackingId` tương ứng |
| **Previous** | không tồn tại |
| **Current** | storm bất kỳ từ provider |
| **previousValue** | `null` |
| **currentValue** | `null` |
| **Bỏ qua khi** | không |

Chống lặp: ngay chu kỳ đó `storm_states` được tạo, nên chu kỳ sau `previous` đã tồn tại.

⚠️ **Lưu ý về GDACS.** `toStormTrackingId()` (`src/domain/services/stormIdentity.ts:3-7`) cắt hậu tố episode: `gdacs:TC:123456:1` → `gdacs:TC:123456`. Nhờ vậy GDACS tăng episode **không** bị hiểu nhầm là bão mới. Bắt buộc giữ hàm này.

⚠️ **Lần chạy đầu tiên trên database rỗng** sẽ sinh `new_storm` cho *tất cả* bão đang hoạt động. Đây là hành vi đúng theo định nghĩa, nhưng cần biết trước khi deploy: nếu không muốn, chạy một chu kỳ "warm-up" chỉ ghi `storm_states` mà không lưu alert. Khuyến nghị **chấp nhận**, không thêm cờ cấu hình.

### 8.2. `category_change`

| | |
|---|---|
| **Trigger** | `previous.category !== current.category` |
| **previousValue** | `previous.category` (có thể `null`) |
| **currentValue** | `current.category` (có thể `null`) |
| **Bỏ qua khi** | không |

Cả hai chiều đều tính là thay đổi:

```text
category_1 → category_2     ⇒ tạo alert (mạnh lên)
category_3 → category_2     ⇒ tạo alert (yếu đi)
null       → category_1     ⇒ tạo alert (thành bão có cấp)
category_1 → null           ⇒ tạo alert (rớt khỏi thang cấp)
```

Điều kiện hiện tại ở `DetectStormAlertsUseCase.ts:154` đã đúng, giữ nguyên.

### 8.3. `alert_level_change`

| | |
|---|---|
| **Trigger** | `current.alertLevel !== null` **và** `current.alertLevel !== previous.alertLevel` |
| **previousValue** | `previous.alertLevel` |
| **currentValue** | `current.alertLevel` |
| **Bỏ qua khi** | `current.alertLevel === null` |

`alertLevel` là mức cảnh báo của GDACS (`Green` / `Orange` / `Red`). Bão NHC không có field này nên luôn `null` ⇒ không bao giờ sinh alert loại này. Điều kiện `!== null` chặn trường hợp provider tạm thời thiếu dữ liệu, tránh sinh alert giả "Red → không có gì". Giữ nguyên `DetectStormAlertsUseCase.ts:158`.

### 8.4. `watch_warning`

| | |
|---|---|
| **Trigger** | `current.watchWarning !== null` **và** `current.watchWarning !== previous.watchWarning` |
| **previousValue** | `previous.watchWarning` |
| **currentValue** | `current.watchWarning` |
| **Bỏ qua khi** | `current.watchWarning === null` |

Cùng lý do với `alert_level_change`. Giữ nguyên `DetectStormAlertsUseCase.ts:162-166`.

### 8.5. `track_change`

Đây là type phức tạp nhất vì có ngưỡng.

| | |
|---|---|
| **Trigger** | Bão đã đi được ≥ **10 km**, và hướng di chuyển lệch ≥ **45°** so với hướng đã lưu |
| **previousValue** | hướng la bàn cũ, suy từ `previous.bearing` |
| **currentValue** | hướng la bàn mới (`N`, `NNE`, …) |
| **Bỏ qua khi** | `previous.bearing === null`, hoặc di chuyển < 10 km, hoặc lệch < 45° |

Hai hằng số ở `DetectStormAlertsUseCase.ts:27-30`:

```text
MIN_MOVEMENT_KM            = 10   ← dưới mức này coi như bão đứng yên, nhiễu toạ độ
MIN_BEARING_CHANGE_DEGREES = 45   ← đúng một cung la bàn 16 hướng
```

Hai ngưỡng này chính là thứ giữ cho `track_change` không spam. Không được bỏ.

Field `bearing` trong `storm_states` được cập nhật theo quy tắc ở `toStormState()` (`DetectStormAlertsUseCase.ts:216`): dùng hướng mới nếu tính được, nếu không thì **giữ nguyên hướng cũ** (không reset về `null`). Giữ nguyên.

`previousValue` cần hướng la bàn cũ — hiện `toStormState` chỉ lưu `bearing` dạng số. Chuyển sang chữ bằng `toCompassDirection()` (`src/domain/services/geo.ts`) lúc tạo alert, không cần thêm field vào `storm_states`.

### 8.6. `storm_dissipated`

| | |
|---|---|
| **Trigger** | Có dòng `storm_states` nhưng `trackingId` không còn trong danh sách active |
| **previousValue** | `null` |
| **currentValue** | `null` |
| **Bỏ qua khi** | không |

Chống lặp: dòng `storm_states` bị xoá ngay sau đó, nên chu kỳ sau không còn gì để so sánh.

⚠️ **Rủi ro cần biết.** Nếu provider tạm thời trả thiếu bão (lỗi upstream, response rỗng), hệ thống sẽ hiểu nhầm là bão tan và sinh alert sai. Với kiến trúc mới, alert sai này **được lưu vĩnh viễn** trong `storm_alerts`.

Phương án phòng vệ (**chưa làm ở MVP**, ghi lại để cân nhắc sau): chỉ coi là tan khi bão vắng mặt ở **N chu kỳ liên tiếp** (ví dụ N = 2), cần thêm một field đếm vào `storm_states`. Ở MVP chấp nhận rủi ro, vì `CompositeStormRepository` đã ném lỗi khi provider hỏng chứ không trả mảng rỗng.

### 8.7. Nhiều alert trong cùng một chu kỳ

Một cơn bão có thể sinh nhiều alert cùng lúc — ví dụ vừa lên cấp vừa đổi hướng. Đó là hành vi đúng, mỗi thay đổi là một bản ghi riêng. Không gộp.

Riêng `new_storm` thì `detectChanges()` `return` ngay (`DetectStormAlertsUseCase.ts:147-149`), nên bão mới chỉ sinh đúng một alert.

---

## 9. Chống duplicate

> **idempotency** (tính bất biến khi lặp): chạy lại cùng một thao tác nhiều lần cho ra cùng một kết quả, không nhân bản dữ liệu.

### 9.1. Cơ chế chính: `storm_states`

Đây là toàn bộ cơ chế chống trùng. Không cần gì thêm.

```text
11:00   category_2 → category_3   ⇒ tạo alert, storm_states.category = category_3
11:05   category_3 → category_3   ⇒ không đổi, không tạo gì
11:10   category_3 → category_3   ⇒ không đổi, không tạo gì
```

`detectChanges()` chỉ sinh alert khi `previous !== current`, và `storm_states` được ghi đè mỗi chu kỳ. Hai điều đó cộng lại là đủ.

### 9.2. Vì sao KHÔNG đặt unique index

Cám dỗ tự nhiên là đặt `unique { trackingId, type, currentValue }`. **Không được làm.**

Bão dao động là chuyện bình thường:

```text
09:00   category_2 → category_3   ⇒ alert #1  (currentValue = category_3)
12:00   category_3 → category_2   ⇒ alert #2  (currentValue = category_2)
15:00   category_2 → category_3   ⇒ alert #3  (currentValue = category_3)  ← unique index chặn mất
```

Alert #3 là một thay đổi có thật, user cần biết. Unique index sẽ nuốt nó.

Đây cũng chính là lý do code hiện tại phải **xoá** `alert_deliveries` khi bão tan (`DetectStormAlertsUseCase.ts:141`) — vì `alertKey` cũ chặn bão tái xuất hiện cùng `trackingId`. Thiết kế mới không có unique index nên không cần cơ chế xoá đó nữa.

### 9.3. Chống trùng khi crash: `_id` xác định

Mục 9.1 xử lý trường hợp bình thường. Còn lại đúng một khe hở: process chết giữa "đã lưu alert" và "chưa update state" (mục 7.4) ⇒ chu kỳ sau phát hiện lại cùng thay đổi đó và tạo alert lần hai.

Cách xử lý: **tự đặt `_id` thay vì để Mongo sinh `ObjectId`.**

```text
_id = trackingId + "|" + type + "|" + (currentValue ?? "") + "|" + observedAt
```

Ví dụ:

```text
nhc:AL012026|category_change|category_3|2026-08-21T06:00:00.000Z
```

`observedAt` lấy từ `StormSummary.datetime` — mốc quan trắc do **provider** công bố, không phải giờ của server:

| Nguồn | `datetime` là gì | File |
|---|---|---|
| NHC | `storm.lastUpdate`, mốc bản tin | `src/adapters/nhc/NhcStormRepository.ts:142` |
| GDACS | timestamp của điểm quan trắc | `src/adapters/gdacs/GdacsStormRepository.ts:234` |

Đây là điểm mấu chốt: cùng một quan trắc thì `datetime` **không đổi** giữa các chu kỳ, nên retry sau crash cho ra `_id` y hệt.

#### Chặn được crash-retry

```text
Chu kỳ N     category_2 → category_3, datetime = 06:00
             _id = nhc:AL012026|category_change|category_3|2026-08-21T06:00:00.000Z
             insert OK
             ✗ CRASH trước khi update storm_states

Chu kỳ N+1   state vẫn category_2 ⇒ lại phát hiện category_2 → category_3
             provider chưa ra bản tin mới ⇒ datetime vẫn 06:00
             ⇒ _id y hệt ⇒ duplicate key ⇒ BỎ QUA
             ⇒ update storm_states thành công
```

Kết quả: đúng **một** alert trong database.

#### Vẫn cho phép bão dao động

```text
09:00   category_2 → category_3   _id = ...|category_3|...T09:00:00.000Z   ✓ lưu
12:00   category_3 → category_2   _id = ...|category_2|...T12:00:00.000Z   ✓ lưu
15:00   category_2 → category_3   _id = ...|category_3|...T15:00:00.000Z   ✓ lưu (datetime khác)
```

So với unique index ở mục 9.2 (nuốt mất alert lúc 15:00) thì cách này chặt về crash mà không hy sinh dao động thật.

#### Triển khai

```text
insertMany(documents, { ordered: false })
```

`ordered: false` cho Mongo insert tiếp những bản ghi còn lại thay vì dừng ở bản ghi lỗi đầu tiên. Sau đó bắt lỗi duplicate key và coi là thành công — hàm `isDuplicateKeyError()` **đã có sẵn** ở `src/adapters/mongo/runMongoOperation.ts:72-82`, dùng lại, không viết mới.

Không cần thêm index: `_id` đã là primary key.

#### Alert `storm_dissipated`

Alert này sinh từ `StormState` chứ không từ `StormSummary` nên không có `storm.datetime` — đây là lý do `storm_states` phải thêm field `datetime` (mục 6.5). Lấy `state.datetime` làm `observedAt`, công thức `_id` giữ nguyên cho cả 6 type.

`currentValue` của type này là `null` ⇒ phần đó trong `_id` là chuỗi rỗng:

```text
nhc:AL012026|storm_dissipated||2026-08-21T06:00:00.000Z
```

#### Giới hạn còn lại — ghi rõ, không che

Vẫn còn một trường hợp lọt: process chết, **và** trước chu kỳ sau provider đã ra bản tin mới với `datetime` khác trong khi bão vẫn `category_3`. Khi đó `_id` khác ⇒ vẫn trùng một alert.

Đây là tập con hẹp hơn nhiều của khe hở ban đầu — NHC ra bản tin 6 giờ/lần, scheduler chạy 15 phút/lần, nên xác suất crash rơi đúng vào ranh giới bản tin là rất thấp. Đóng nốt phần này cần transaction đa collection (Mongo replica set), đắt hơn nhiều so với giá trị thu được. **Chấp nhận.**

### 9.4. Vì sao không dùng "cửa sổ thời gian"

Một phương án khác từng cân nhắc: trước khi insert, kiểm tra xem đã có alert cùng `{trackingId, type, currentValue}` trong N phút gần đây chưa.

| | `_id` xác định | Cửa sổ N phút |
|---|---|---|
| Chặn crash-retry | Có | Có |
| Bão dao động nhanh hơn N phút | Vẫn lưu đúng | **Bị nuốt — mất alert** |
| Query thêm trước mỗi insert | Không | Có |
| Phụ thuộc chọn đúng N | Không | Có |

Dòng thứ hai là lý do loại: mất alert là hậu quả tệ nhất cần tránh, mà cửa sổ thời gian lại tạo ra đúng nó. **Không dùng.**

### 9.5. Bỏ `alert_deliveries` khỏi luồng in-app

`claimDelivery()` là chống trùng **theo từng thiết bị** (`IAlertDeliveryRepository.ts:8`). Alert mới không thuộc thiết bị nào nên khái niệm này không còn nghĩa ở luồng in-app. Xử lý ở mục 14.

---

## 10. In-app Alerts API

### 10.1. Luồng

```text
FE giữ trackedStormIds ở local
       ↓
POST /v1/alerts/query  { stormIds: [...] }
       ↓
BE: stormIds → trackingIds → query storm_alerts
       ↓
sort createdAt DESC, limit
       ↓
trả về mảng alerts
```

Không có bước xác định user. Không có UUID. Không có `deviceToken`.

### 10.2. Vì sao dùng POST chứ không phải GET

Danh sách `stormIds` có thể dài, và id GDACS chứa dấu `:` — nhét vào query string phải encode, dễ vượt giới hạn độ dài URL. Repo cũng đã có tiền lệ: `POST /v1/storms/tracking` (`Server.ts:136`) nhận `stormIds` y hệt.

### 10.3. Request

```http
POST /v1/alerts/query
Content-Type: application/json
```

```json
{
  "stormIds": [
    "nhc:AL012026",
    "gdacs:TC:123456:1"
  ],
  "limit": 50
}
```

### 10.4. Validation

Dùng lại `readStormIds()` có sẵn (`Server.ts:659-672`) — không viết hàm mới:

| Field | Bắt buộc | Quy tắc | Lỗi |
|---|---|---|---|
| `stormIds` | Có | mảng 1–20 phần tử, mỗi phần tử khớp `nhc:XX999999` hoặc `gdacs:TC:<số>:<số>` | 400 `BAD_REQUEST` |
| `limit` | Không | số nguyên 1–200, mặc định **50** | 400 `BAD_REQUEST` |

Các tình huống biên:

| Tình huống | Kết quả |
|---|---|
| `stormIds` rỗng `[]` | **400** — đồng nhất với `POST /v1/storms/tracking` |
| Thiếu field `stormIds` | 400 |
| `stormId` sai định dạng | 400 |
| `stormId` đúng định dạng nhưng không tồn tại | **200**, mảng rỗng — không phải lỗi |
| Storm có thật nhưng chưa từng có alert | 200, mảng rỗng |
| Mongo không kết nối được | 503 `SERVICE_UNAVAILABLE` (`StorageUnavailableError` đã được `Server.ts` map sẵn) |

### 10.5. ⚠️ Chuyển `stormId` → `trackingId` trước khi query

Chi tiết dễ sai nhất của toàn bộ tài liệu này.

Alert lưu theo `trackingId` (đã cắt episode). FE lại gửi lên `stormId` có episode. Query thẳng `stormId` sẽ **không ra kết quả nào cho bão GDACS**.

```text
FE gửi:      gdacs:TC:123456:1
Lưu trong DB: gdacs:TC:123456        ← khác nhau
```

Bắt buộc map trước khi query:

```ts
const trackingIds = [...new Set(stormIds.map(toStormTrackingId))];
```

Bão NHC không bị ảnh hưởng vì `toStormTrackingId` trả về nguyên văn.

### 10.6. Response

```json
{
  "ok": true,
  "data": [
    {
      "id": "nhc:AL012026|category_change|category_3|2026-08-21T03:00:00.000Z",
      "stormId": "nhc:AL012026",
      "trackingId": "nhc:AL012026",
      "stormName": "Erin",
      "type": "category_change",
      "previousValue": "category_2",
      "currentValue": "category_3",
      "title": "Erin strengthened",
      "description": "Erin strengthened from Category 2 to Category 3.",
      "lat": 22.3,
      "lon": -68.4,
      "windSpeed": 100,
      "category": "category_3",
      "observedAt": "2026-08-21T03:00:00.000Z",
      "createdAt": "2026-08-21T03:42:00.000Z"
    }
  ],
  "cacheStatus": "bypass"
}
```

`id` là chuỗi ghép (mục 9.3), không phải `ObjectId`. FE chỉ nên coi nó là một khoá đục — dùng làm `key` khi render list, hoặc lưu vào danh sách "đã xem" ở local. **Không** parse để lấy thông tin ra: định dạng có thể đổi.

`observedAt` (lúc bão thực sự ở trạng thái đó) và `createdAt` (lúc backend phát hiện) lệch nhau tối đa một chu kỳ scheduler. Hiển thị cho user thì dùng `observedAt`; sắp xếp thì backend đã dùng `createdAt`.

Bọc trong `{ ok, data, cacheStatus }` là do `_sendData()` (`Server.ts:563-569`) làm sẵn, không cần xử lý thêm. `cacheStatus` luôn là `"bypass"` vì không cache.

### 10.7. Sắp xếp và phân trang

- Sort: `createdAt` giảm dần (mới nhất trước) — trộn chung tất cả storm trong một danh sách phẳng, giống một feed.
- Limit: mặc định 50, tối đa 200.
- **Phân trang: chưa cần ở MVP.** Một cơn bão sống ~2 tuần, mỗi chu kỳ 15 phút và alert chỉ sinh khi có thay đổi thật ⇒ thực tế vài chục alert mỗi bão. 20 bão × vài chục alert vẫn nằm gọn dưới limit 200.
- Hướng mở rộng khi cần: thêm `before` (ISO timestamp), query `createdAt < before`. Index `{trackingId: 1, createdAt: -1}` đã phục vụ được, không cần đổi schema.

### 10.8. Không cache

Không đưa endpoint này qua lớp `adapters/cache/`. Alert phải hiện ngay khi vừa sinh; cache chỉ làm chậm mà không tiết kiệm được gì đáng kể — đây là truy vấn database nội bộ, không phải gọi provider bên ngoài.

---

## 11. Push Notification boundary

Mục này chỉ mô tả **ranh giới**. Không thiết kế lại APNs.

### 11.1. Ranh giới

```text
Storm Alert
     ↓
Save vào storm_alerts        ← bắt buộc, luôn xảy ra
     ↓
Optional Push Delivery       ← có thể bỏ qua hoàn toàn
```

> **delivery** (phân phối): việc đẩy một alert đã có sẵn ra một kênh bên ngoài. Nó xảy ra *sau* khi alert đã được lưu, và độc lập với việc alert tồn tại.

### 11.2. Điều kiện để push được gửi

Push chỉ gửi khi thiết bị thoả **cả hai**:

```text
đã cấp notification permission
        và
đã đăng ký deviceToken với backend (POST /v1/devices)
```

Không có `deviceToken` ⇒ không push. Alert vẫn được tạo và lưu bình thường.

### 11.3. Ràng buộc bắt buộc

1. **Lưu trước, gửi sau.** Không có ngoại lệ.
2. **Lỗi APNs chỉ được log.** Không rollback, không xoá alert, không ném ra ngoài chu kỳ.
3. **Một thiết bị lỗi không được chặn các thiết bị còn lại.** Logic try/catch từng thiết bị hiện tại (`DetectStormAlertsUseCase.ts:124-128`) đã đúng, giữ nguyên khi tách ra.
4. **Push hoàn toàn tắt được** mà in-app alerts vẫn chạy đủ.

### 11.4. Thay đổi nội dung: `distanceKm` biến mất

`buildStormAlertMessage(alert, distanceKm)` (`src/domain/services/alertMessages.ts:34`) hiện chèn câu `"240 km from your area"`. Con số đó lấy từ `region_subscriptions` của **từng thiết bị**.

Alert mới không thuộc thiết bị nào ⇒ lúc tạo alert phải gọi với `distanceKm = null`, và câu đó không xuất hiện trong `description` lưu vào DB.

Nếu sau này push muốn có khoảng cách, bước push tự render lại nội dung riêng cho từng thiết bị. Nội dung trong `storm_alerts` là bản trung lập, dùng chung cho mọi người.

### 11.5. `alertMessages.ts` cần biết `previousValue`

Nội dung hiện tại chỉ mô tả trạng thái mới:

```text
title:       "Erin is now a Category 3 hurricane"
description: "Winds now at 167 km/h."
```

Nội dung mong muốn mô tả *sự thay đổi*:

```text
title:       "Erin strengthened"
description: "Erin strengthened from Category 2 to Category 3."
```

⇒ `buildStormAlertMessage()` nhận thêm `previousValue`, và nhánh `category_change` phân biệt mạnh lên / yếu đi. Các nhánh khác giữ nguyên cấu trúc.

Bảng `CATEGORY_SAFETY_MESSAGES` (`alertMessages.ts:24-30`) giữ nguyên — vẫn nối câu an toàn vào alert cấp 1–5.

### 11.6. Nội dung được chụp lại tại thời điểm ghi

`title` và `description` được render một lần rồi lưu. Sửa `alertMessages.ts` về sau **không** làm thay đổi các alert đã lưu.

Đây là lựa chọn có chủ ý: inbox phải hiển thị đúng thứ đã báo lúc đó. Hệ quả cần chấp nhận: đa ngôn ngữ sau này sẽ phải render ở client từ `type` + `previousValue` + `currentValue` (dữ liệu đã đủ để làm việc đó).

---

## 12. Use Cases

### 12.1. `DetectStormAlertsUseCase` (refactor)

**Trước:** detect + tìm device + chống trùng + dựng nội dung + gửi push + update state — sáu việc trong một class.

**Sau:** ba việc.

```text
Đầu vào:  (không có)
Việc:
   1. Lấy active storms
   2. Đọc storm_states, so sánh, sinh StormAlert[] (kèm _id xác định)
   3. Lưu storm_alerts, rồi update storm_states
Đầu ra:   { stormsSeen, alerts, saved, skippedAsDuplicate }
```

`saved` và `skippedAsDuplicate` tách riêng: `skippedAsDuplicate > 0` là dấu hiệu chu kỳ trước đã crash giữa chừng, đáng để log.

Dependency sau refactor:

```ts
constructor(
    _storms:  ActiveStormsRepository,
    _states:  StormStateRepository,
    _alerts:  StormAlertRepository,      // ← mới
    _now:     () => number = Date.now,   // ← mới, để test có thể cố định createdAt
    _logError: (message: string) => void = (m) => console.error(m),
)
```

Bỏ khỏi constructor: `_stormSubscriptions`, `_regionSubscriptions`, `_deliveries`, `_sendPushNotification`.

Xoá method `_deliver()`. Các hàm thuần `detectChanges`, `hasChangedCourse`, `getMovementBearing`, `getMovementDirection`, `toStormState`, `toAlert`, `toDissipatedAlert` giữ nguyên, chỉ đổi phần dựng `previousValue`/`currentValue` thay cho `signature`.

Thêm một hàm thuần nữa, đặt cạnh `toAlertKey` cũ (`DetectStormAlertsUseCase.ts:259-262`) — nó thay thế trực tiếp hàm đó:

```ts
/** Khoá xác định của một sự kiện: cùng quan trắc + cùng loại thay đổi = cùng một alert. */
function toAlertId (alert: StormAlert): string {
    return alert.trackingId + "|" + alert.type + "|" + (alert.currentValue ?? "") + "|" + alert.observedAt;
}
```

`DetectStormAlertsResult` đổi từ `{stormsSeen, alerts, sent, skippedAsDuplicate, failed}` thành `{stormsSeen, alerts, saved, skippedAsDuplicate}`. Kéo theo phải sửa dòng log ở `startAlertScheduler.ts:48-54` và response của endpoint test `POST /v1/test/storm-alerts/:stormId/dissipate` (`Server.ts:489-561`).

### 12.2. `GetStormAlertsUseCase` (mới)

```text
Đầu vào:  { stormIds: string[], limit: number }
Việc:
   1. stormIds → trackingIds (toStormTrackingId, khử trùng lặp)
   2. Query storm_alerts theo trackingIds
   3. Sort createdAt DESC, cắt theo limit
Đầu ra:   StormAlert[]
```

Chỉ có một dependency: `StormAlertRepository`.

### 12.3. Push — chưa dựng vội

Sau khi Phase 1–4 xong và chạy ổn, tách push thành một bước riêng. Hai lựa chọn, **quyết định sau khi có số liệu thật**, không quyết bây giờ:

- **A.** `DeliverStormAlertPushUseCase` — nhận `StormAlert[]`, tự tìm thiết bị, tự gửi. Scheduler gọi tuần tự: detect xong thì deliver.
- **B.** Để nguyên phần push trong scheduler như một bước thứ hai, không tạo class mới.

Ở MVP, chỉ cần đảm bảo push **không** nằm bên trong `DetectStormAlertsUseCase`. Không tạo abstraction trước khi cần.

---

## 13. Repository / Database

### 13.1. File sẽ thêm hoặc sửa

Bám đúng cây thư mục hiện có. **Không tạo folder mới.**

```text
src/domain/entities/alert/
    StormAlert.ts                      (sửa)
    StormState.ts                      (sửa — thêm datetime, mục 6.5)

src/domain/repositories/alert/
    IStormAlertRepository.ts           (mới)
    IStormStateRepository.ts           (giữ nguyên)
    IAlertDeliveryRepository.ts        (giữ nguyên, sẽ deprecate)

src/domain/use-cases/alert/
    DetectStormAlertsUseCase.ts        (refactor)
    GetStormAlertsUseCase.ts           (mới)

src/domain/services/
    alertMessages.ts                   (sửa — mục 11.5)
    stormIdentity.ts                   (giữ nguyên)
    geo.ts                             (giữ nguyên)

src/adapters/mongo/
    MongoStormAlertRepository.ts       (mới)
    MongoStormStateRepository.ts       (sửa — map thêm datetime)
    models.ts                          (thêm stormAlertSchema, thêm datetime vào stormStateSchema)
    runMongoOperation.ts               (thêm interface AlertCollection)

src/http/
    Server.ts                          (thêm 1 route + 1 handler + 1 helper readLimit)

src/app.ts                             (wiring)
```

### 13.2. Port `IStormAlertRepository`

Nhỏ nhất có thể — đúng hai method:

```ts
interface StormAlertRepository {
    /**
     * Ghi các alert vừa phát hiện. Gọi TRƯỚC khi update storm_states.
     * Alert đã tồn tại (trùng _id) được bỏ qua im lặng, không phải lỗi.
     * Trả về số bản ghi thực sự được ghi mới.
     */
    saveAlerts (alerts: StormAlert[]): Promise<number>;

    /** Alert của các storm được chỉ định, mới nhất trước. */
    listAlertsByTrackingIds (trackingIds: string[], limit: number): Promise<StormAlert[]>;
}
```

`saveAlerts` trả về `number` chứ không phải `void` để use-case tính được `skippedAsDuplicate = alerts.length - saved`.

Không có `deleteAlerts` — alert không bao giờ bị xoá. Không có `countAlerts` — chưa có use case.

### 13.3. `runMongoOperation.ts`

File này khai báo interface tối giản cho từng collection để test thay bằng object thường (`SubscriptionCollection`, `StateCollection`, `DeliveryCollection`). Thêm một cái nữa theo đúng khuôn mẫu:

```ts
interface AlertCollection {
    insertMany (
        documents: Record<string, unknown>[],
        options: { ordered: false },
    ): PromiseLike<{ length: number }>;
    find (filter: Record<string, unknown>): {
        sort (spec: Record<string, 1 | -1>): {
            limit (count: number): { lean (): PromiseLike<Record<string, unknown>[]> };
        };
    };
}
```

`runMongoOperation()` và `StorageUnavailableError` dùng lại y nguyên, không sửa.

### 13.4. Ghi alert: bỏ qua duplicate, không coi là lỗi

`saveAlerts` phải phân biệt hai loại lỗi. Duplicate key là chuyện bình thường (crash-retry, mục 9.3), còn lại mới là sự cố thật:

```ts
public async saveAlerts (alerts: StormAlert[]): Promise<number> {
    if (!alerts.length) {
        return 0;
    }

    try {
        // ordered: false ⇒ một _id trùng không chặn các bản ghi còn lại.
        const inserted = await runMongoOperation(
            () => this._alerts.insertMany(alerts.map(toDocument), { ordered: false }),
            this._isConnected,
        );

        return inserted.length;
    } catch (error) {
        // Alert đã tồn tại từ chu kỳ trước: đúng như thiết kế, không phải lỗi.
        if (isDuplicateKeyError(error)) {
            return 0;
        }

        throw error;
    }
}
```

`isDuplicateKeyError` đã có sẵn ở `runMongoOperation.ts:72-82` — nó tự đi ngược chuỗi `cause`, nên vẫn nhận ra lỗi dù `runMongoOperation` đã bọc thành `StorageUnavailableError`. Dùng lại, không viết mới.

⚠️ Với `ordered: false`, khi chỉ **một phần** bản ghi bị trùng, driver vẫn ném lỗi nhưng những bản ghi hợp lệ đã được ghi thành công. Nhánh `catch` trả `0` là con số bảo thủ (thực tế có thể đã ghi vài bản) — chỉ ảnh hưởng số liệu log, không ảnh hưởng dữ liệu. Chấp nhận để giữ code đơn giản.

### 13.5. Thời gian: `Date` trong Mongo, ISO string trong entity

Toàn bộ codebase mang thời gian dạng chuỗi ISO trong entity (`observedAt`, `datetime`, `time`…). Giữ đúng quy ước đó: mapper trong `MongoStormAlertRepository` chuyển `Date` ⇄ ISO string ở biên repository, giống cách `toStormState()` đang ép kiểu (`MongoStormStateRepository.ts:32-45`).

`observedAt` lưu dạng **string** (nó là thành phần của `_id`, phải khớp từng ký tự); `createdAt` lưu dạng **Date**.

Lưu ý: schema Mongoose đang bật `timestamps: true` sẽ tự sinh `createdAt`/`updatedAt`. Với `storm_alerts` nên **tự đặt `createdAt`** (từ `_now()`) để mọi alert trong cùng một chu kỳ có chung mốc thời gian và test cố định được. Đặt `timestamps: false` cho schema này.

### 13.6. Fixture mode

Ở `STORM_DATA_MODE=fixture` scheduler không chạy (`app.ts:231-239`) nên `storm_alerts` sẽ luôn rỗng, FE không có gì để dựng giao diện.

Đề xuất thêm `src/adapters/fixture/FixtureStormAlertRepository.ts` với vài alert cắm sẵn, chọn trong `app.ts` cùng chỗ đang chọn fixture cho device/subscription (`app.ts:144-150`). Việc nhỏ, làm ở Phase 3 hoặc 4. Không bắt buộc cho backend nhưng chặn được việc FE bị block.

### 13.7. Không cần migration dữ liệu

`storm_alerts` là collection mới, bắt đầu rỗng. Không có dữ liệu cũ để chuyển đổi. Mongoose `autoIndex` đang bật nên index tự tạo khi khởi động.

`storm_states` thêm field `datetime` (mục 6.5) cũng không cần backfill: dòng cũ map thành `null`, chu kỳ scheduler kế tiếp ghi đè giá trị thật. Chỉ cần lưu ý — nếu một bão tan **đúng chu kỳ đầu tiên sau khi deploy**, `state.datetime` có thể còn `null` ⇒ dùng chuỗi rỗng trong `_id`. Chỉ ảnh hưởng đúng một chu kỳ.

---

## 14. Những phần giữ lại và refactor

### KEEP — giữ nguyên, không đụng vào

| Thành phần | Lý do |
|---|---|
| `IStormStateRepository`, `storm_states` | Nguồn duy nhất để so sánh trạng thái. Không có nó thì không phát hiện được thay đổi. Chỉ thêm đúng field `datetime` (mục 6.5), vai trò không đổi. |
| `stormIdentity.ts` (`toStormTrackingId`) | Chặn GDACS episode bị hiểu nhầm là bão mới. Cũng cần cho API query. |
| `geo.ts` (`getDistanceKm`, `getBearing`, `toCompassDirection`) | Phục vụ `track_change`. |
| `startAlertScheduler.ts` | Chống chồng chu kỳ, gate theo `isMongoConnected`, không chết process khi lỗi. Chỉ sửa đúng dòng log. |
| `SendPushNotificationUseCase`, `ApnsPushNotificationRepository` | Không đổi gì bên trong, chỉ đổi nơi được gọi. |
| `STORM_ALERT_TYPES` | Đang được `Server.ts` dùng để validate. 6 type giữ nguyên. |

### REFACTOR — sửa nhưng không xoá

| Thành phần | Sửa gì |
|---|---|
| `DetectStormAlertsUseCase` | Bỏ tìm device và gửi push. Chỉ còn detect → lưu alert → update state. Mục 12.1. |
| `StormAlert` entity | Bỏ `signature`, `alertLevel`, `watchWarning`, `direction`. Thêm `id`, `previousValue`, `currentValue`, `createdAt`. |
| `alertMessages.ts` | Nhận `previousValue`; gọi với `distanceKm = null`. Mục 11.4, 11.5. |
| `Server.ts` | Thêm route `POST /v1/alerts/query`, handler, helper `readLimit`. Dùng lại `readStormIds` và `readJsonObject`. |
| `app.ts` | Wiring repository và use-case mới; bỏ 4 dependency khỏi `DetectStormAlertsUseCase`. |

### DEPRECATE LATER — không xoá ngay

| Thành phần | Trạng thái | Lý do chưa xoá |
|---|---|---|
| `IAlertDeliveryRepository`, `MongoAlertDeliveryRepository`, `alert_deliveries` | Không còn dùng ở luồng in-app | Chống trùng đã chuyển sang `storm_states`. Nhưng khi push tách ra, có thể vẫn cần chống gửi trùng cho từng thiết bị. Chờ đến khi push xong (Phase 5) rồi mới quyết. |
| `StormSubscriptionRepository`, `storm_subscriptions` | Không dùng cho in-app | FE tự giữ danh sách tracking. Nhưng push cần biết gửi cho ai. |
| `RegionSubscriptionRepository`, `region_subscriptions` | Không dùng cho in-app | Push theo bán kính vẫn là tính năng có giá trị. |
| `DeviceRepository`, `devices`, `POST /v1/devices` | Không dùng cho in-app | Là nơi duy nhất lưu `deviceToken` — push bắt buộc phải có. **Không được xoá.** |

**Ranh giới của phase này:** không xoá bảng, không xoá route, không xoá repository. Chỉ ngắt chúng khỏi luồng detect. Bất kỳ đề xuất xoá nào cũng phải để sang một phase riêng, sau khi push đã chạy ổn định trên kiến trúc mới.

---

## 15. Migration Plan

Sáu phase. Mỗi phase phải **compile được và test xanh** trước khi sang phase kế. Không gộp, không xoá nhiều thứ cùng lúc.

### Phase 1 — Thêm chỗ lưu alert

- Thêm `datetime` vào `StormState`, `storm_states` schema, và `toStormState()` trong `MongoStormStateRepository`.
- Sửa entity `StormAlert` (thêm `id`, `previousValue`, `currentValue`, `observedAt`, `createdAt`; bỏ `signature`, `alertLevel`, `watchWarning`, `direction`).
- Thêm `IStormAlertRepository`.
- Thêm `stormAlertSchema` (collection `storm_alerts`, `_id: String`, `timestamps: false`) vào `models.ts` + index `{trackingId: 1, createdAt: -1}`.
- Thêm `AlertCollection` vào `runMongoOperation.ts`.
- Thêm `MongoStormAlertRepository` với `insertMany({ ordered: false })` + `isDuplicateKeyError` (mục 13.4).
- Test `test/MongoStormAlertRepository.test.ts` với collection giả:
  - ghi mới trả về số bản ghi đúng;
  - collection ném lỗi duplicate key ⇒ trả `0`, **không** ném ra ngoài;
  - collection ném lỗi khác ⇒ **có** ném ra ngoài.

Chưa ai gọi tới. Hành vi hệ thống không đổi.

### Phase 2 — Detect lưu alert trước

- `DetectStormAlertsUseCase` nhận thêm `_alerts` và `_now`.
- Sinh `previousValue`/`currentValue` thay cho `signature`; thêm `observedAt` từ `storm.datetime` (với `storm_dissipated` thì từ `state.datetime`).
- Thêm hàm `toAlertId()`, thay `toAlertKey()` (mục 12.1).
- Sửa `alertMessages.ts` (mục 11.5), gọi với `distanceKm = null`.
- Thứ tự: `saveAlerts()` **trước** `saveState()`.
- **Vẫn giữ nguyên `_deliver()` và push.** Chỉ thêm bước lưu.
- Test: cập nhật `test/DetectStormAlertsUseCase.test.ts`, `test/DissipateStorm.test.ts`, thêm:
  - **crash-retry**: chạy `execute()` hai lần với cùng dữ liệu provider và `storm_states` *không* được cập nhật giữa hai lần ⇒ chỉ có **một** alert trong repository giả, `skippedAsDuplicate === 1`;
  - **dao động**: cat_2 → cat_3 → cat_2 → cat_3 với `datetime` khác nhau ⇒ **ba** alert.

Sau phase này alert đã được lưu, push vẫn chạy như cũ. Có thể deploy và quan sát dữ liệu thật.

### Phase 3 — Thêm use case đọc

- `GetStormAlertsUseCase`.
- (Tuỳ chọn) `FixtureStormAlertRepository`.
- Test: `test/GetStormAlertsUseCase.test.ts`, đặc biệt case GDACS `gdacs:TC:123456:1` → `gdacs:TC:123456`.

### Phase 4 — Thêm API

- Route `POST /v1/alerts/query` + handler + `readLimit`.
- Wiring trong `app.ts`, thêm nhóm `alert` vào `ServerUseCases`.
- Cập nhật `API.md`.
- Test: các case ở mục 10.4.

**Đến đây yêu cầu nghiệp vụ đã xong.** In-app alerts chạy được, không phụ thuộc quyền notification.

### Phase 5 — Tách push khỏi detect

- Đưa `_deliver()` ra khỏi `DetectStormAlertsUseCase`.
- Scheduler gọi hai bước: detect trước, deliver sau.
- Bỏ 4 dependency khỏi constructor của detect.
- Cập nhật `DetectStormAlertsResult` và dòng log.
- Test: push lỗi ⇒ alert vẫn nằm trong `storm_alerts`.

### Phase 6 — Dọn dẹp

Chỉ làm sau khi Phase 5 chạy ổn định trên production.

- Đánh giá lại `alert_deliveries`: push mới có còn cần chống trùng theo thiết bị không?
- Đánh giá lại `storm_subscriptions` / `region_subscriptions`.
- Xoá code chết, nếu có, từng thứ một.

---

## 16. Out of Scope

Những thứ **không** thuộc phạm vi thiết kế này. Đưa bất kỳ mục nào vào sẽ bị coi là over-engineering.

**Về người dùng:**
- authentication, user account
- installation UUID, device identity cho in-app alerts
- per-user alert inbox
- đồng bộ alert giữa nhiều thiết bị

**Về trạng thái đọc:**
- `read` / `unread` / `seen` / `opened` phía server

  Backend không biết user là ai thì không thể quản lý trạng thái đọc cho ai. FE tự lo, ví dụ lưu `lastSeenAlertAt` ở local rồi so với `createdAt`, hoặc lưu danh sách alert id đã xem. **Đây là quyết định có chủ ý, không phải thiếu sót.**

**Về hạ tầng:**
- Kafka, Redis Streams, message queue, event bus
- WebSocket realtime
- Firebase

**Về kênh gửi:**
- thiết kế lại APNs từ đầu
- email / SMS alert
- thiết kế lại alert theo vùng (region-based)

**Khác:**
- weather alerts (cảnh báo thời tiết, khác storm alerts)
- historical analytics, thống kê, biểu đồ
- xoá hoặc archive alert cũ

---

## 17. Acceptance Criteria

### Phát hiện thay đổi

- [ ] Storm đổi category (`category_2` → `category_3`) → tạo **đúng 1** alert `category_change`, `previousValue = category_2`, `currentValue = category_3`
- [ ] Storm yếu đi (`category_3` → `category_2`) → cũng tạo alert
- [ ] Scheduler chạy lại khi trạng thái không đổi → **không** tạo alert mới
- [ ] Storm xuất hiện lần đầu → tạo **đúng 1** alert `new_storm`, không kèm alert nào khác
- [ ] Storm đổi `alertLevel` từ `Green` sang `Red` → tạo alert `alert_level_change`
- [ ] `alertLevel` chuyển thành `null` → **không** tạo alert
- [ ] Storm đổi hướng ≥ 45° sau khi đã đi ≥ 10 km → tạo alert `track_change`
- [ ] Storm đổi hướng < 45° → **không** tạo alert
- [ ] Storm biến mất khỏi danh sách active → tạo alert `storm_dissipated` và xoá dòng `storm_states`
- [ ] Storm GDACS tăng episode (`gdacs:TC:123456:1` → `:2`) → **không** bị hiểu là bão mới

### Lưu trữ

- [ ] Alert được lưu vào `storm_alerts` **trước khi** `storm_states` được cập nhật
- [ ] Alert được lưu **kể cả khi trong hệ thống không có `deviceToken` nào**
- [ ] Alert của bão đã tan **vẫn còn** trong `storm_alerts` sau khi bão tan
- [ ] Không có field `userId` / `deviceId` / `deviceToken` / `installationId` / `UUID` nào trong `storm_alerts`
- [ ] `title` và `description` được lưu sẵn, không phải render lại lúc đọc

### Chống trùng

- [ ] `_id` của alert là chuỗi `trackingId|type|currentValue|observedAt`, **không** phải `ObjectId`
- [ ] Chạy `execute()` hai lần liên tiếp mà `storm_states` chưa kịp cập nhật (mô phỏng crash) → chỉ có **1** alert trong `storm_alerts`, `skippedAsDuplicate === 1`
- [ ] Bão dao động `cat_2 → cat_3 → cat_2 → cat_3` với `datetime` khác nhau → lưu đủ **3** alert, không cái nào bị nuốt
- [ ] Lỗi duplicate key **không** làm chu kỳ scheduler thất bại
- [ ] Lỗi database khác duplicate key **vẫn** được ném ra và log

### Push

- [ ] Push thất bại (APNs lỗi) → alert **vẫn còn** trong `storm_alerts`
- [ ] Một thiết bị lỗi không chặn việc gửi cho các thiết bị còn lại
- [ ] Tắt push hoàn toàn → in-app alerts vẫn chạy đủ
- [ ] `description` lưu trong DB **không** chứa cụm `"km from your area"`

### API

- [ ] FE gửi 3 `stormIds` → chỉ nhận alert của đúng 3 storm đó
- [ ] FE gửi `gdacs:TC:123456:1` → nhận được alert lưu dưới `gdacs:TC:123456`
- [ ] Kết quả sắp xếp `createdAt` giảm dần
- [ ] `limit` mặc định 50, vượt 200 → 400
- [ ] `stormIds` rỗng → 400
- [ ] `stormId` hợp lệ nhưng không có alert → 200 với mảng rỗng
- [ ] Mongo mất kết nối → 503, không phải 500
- [ ] **Không cần** UUID / installationId để lấy in-app alerts
- [ ] **Không cần** quyền notification để xem alerts trong app

### Không phá vỡ cái đang có

- [ ] `npm run build` không lỗi TypeScript
- [ ] Toàn bộ test hiện có vẫn xanh
- [ ] `POST /v1/devices` và các route subscription vẫn hoạt động như cũ
- [ ] Endpoint test `POST /v1/test/storm-alerts/:stormId/dissipate` vẫn chạy
