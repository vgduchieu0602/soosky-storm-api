# FOLDER.md — Cấu trúc & ý nghĩa thư mục/file của `soosky-storm-api`

---

## 1. Tổng quan kiến trúc

- **Stack:** Node.js ≥ 22 (ESM), TypeScript, Express 5, build bằng `esbuild`, test bằng `tsx --test`.
- **Mô hình:** Ports & Adapters (hexagonal).
  - `src/domain/` — lõi nghiệp vụ thuần túy, **không** import bất kỳ thư viện ngoài hay framework.
    Định nghĩa *entities* (kiểu dữ liệu) và *repositories* (interface = "ports").
  - `src/adapters/` — các triển khai cụ thể của ports (NHC, GDACS, Mongo, APNs, OpenWeather, …).
  - `src/http/` — lớp HTTP (Express): nhận request, validate, gọi use-case, format response.
  - `src/app.ts` — **composition root**: nơi "lắp ráp" mọi adapter + use-case rồi khởi động server.
- **Biến môi trường** đọc tập trung ở `src/config.ts` (dựa trên `dotenv` + `.env`).

## 2. File ở thư mục gốc (root)

| File | Ý nghĩa |
|------|---------|
| `package.json` | Khai báo tên, version, scripts, dependencies (`express`, `mongoose`, `dotenv`, `fast-xml-parser`, `adm-zip`) và devDeps (`tsx`, `typescript`, `esbuild`). |
| `package-lock.json` | Khóa phiên bản chính xác của dependencies (tự sinh, đừng sửa tay). |
| `tsconfig.json` | Cấu hình TypeScript (target/module ESM, đường dẫn `*.js` cho import). |
| `Dockerfile` | Build image Docker chạy `dist/app.js` (dùng cho staging/production). |
| `docker-compose.yml` | Định nghĩa 1 container `soosky-storm-api` (port host `3001` → container `3000`), mount secret APNs, healthcheck `/health`, giới hạn RAM. **Không** chứa MongoDB (dùng Atlas ngoài). |
| `.dockerignore` | Loại file không copy vào image Docker (node_modules, .git, …). |
| `.env` | **Cấu hình thật đang chạy** (có secret: Mongo URI, APNs key path). Bị gitignore, KHÔNG commit. |
| `.env.example` | Mẫu `.env` đầy đủ, an toàn để commit/hướng dẫn. Copy thành `.env` rồi điền giá trị thật. |
| `.github/workflows/ci.yml` | Pipeline CI GitHub Actions (lint/test/build khi push/PR). |
| `.gitignore` | Loại node_modules, dist, .env, secrets khỏi git. |
| `API.md` | Tổng quan tài liệu API (các endpoint chính). |
| `DEPLOY.md` | Hướng dẫn deploy lên VPS (Docker + nginx). |
| `TESTING.md` | Hướng dẫn chạy test (fixture vs live, yêu cầu Mongo/APNs). |
| `FOLDER.md` | File này — giải thích cấu trúc dự án. |

---

## 3. `src/` — mã nguồn chính

### `src/app.ts` — Composition root
File duy nhất khởi động app. Nó:
1. Đọc `config` từ `src/config.ts`.
2. Tạo các **adapter** (NHC, GDACS, Mongo, APNs, OpenWeather, RainViewer, fixture…) — ở `STORM_DATA_MODE=fixture` thì dùng repo fixture, ở `live` thì dùng repo thật + cache.
3. Tạo các **use-case** và gom vào object `useCases`.
4. Khởi tạo `Server` (Express), kết nối Mongo (nếu không phải fixture), và chạy `startAlertScheduler` (quét bão định kỳ) khi `ALERTS_ENABLED=true` + `live`.

### `src/config.ts` — Đọc biến môi trường
Load `.env` qua `dotenv`, parse & validate các env var, cung cấp object `config` (http, mongo, nhc, gdacs, openWeather, apns, cache TTL, alerts, rateLimit). Có fallback an toàn cho production. Ném `InvalidEnvVarError` nếu giá trị sai.

### `src/domain/` — Lõi nghiệp vụ
| Thư mục/file | Ý nghĩa |
|--------------|---------|
| `entities/` | Các kiểu dữ liệu nghiệp vụ: `StormSummary`, `TrackedStorm`, `StormTrack`, `StormCone`, `StormSpaghetti`, `HistoricalStormTrack`, `CurrentWeather`, `ForecastWeather`, `MapTile`, `Radar`, `Device`, `StormSubscription`, `RegionSubscription`, `StormState`, `StormAlert`, `PushNotification`, `DemoStormSummary`. |
| `errors/` | Lỗi nghiệp vụ: `StormNotFoundError`, `StormProviderError` (lỗi upstream), `StorageUnavailableError` (Mongo lỗi), `PushNotificationError`. |
| `repositories/` | **Các interface (ports)**: `IStormRepository`, `IActiveStormsRepository`, `IStormStateRepository`, `IStormConeRepository`, `ISpaghettiRepository`, `IHistoricalStormTrackRepository`, `ICurrentWeatherRepository`, `IForecastWeatherRepository`, `IMapTileRepository`, `IRadarRepository`, `IDeviceRepository`, `IStormSubscriptionRepository`, `IRegionSubscriptionRepository`, `IStormAlertRepository`, `IAlertDeliveryRepository`, `IPushNotificationRepository`. Adapters implement các interface này. |
| `use-cases/` | Từng nghiệp vụ một, gọi qua ports (không biết adapter nào đằng sau):<br>• `storm/` — `GetActiveStormsUseCase`, `GetTrackedStormsUseCase`, `GetDemoStormsUseCase`, `GetStormTrackUseCase`, `GetStormConeUseCase`, `GetStormSpaghettiUseCase`, `GetHistoricalStormTrackUseCase`<br>• `weather/` — `GetCurrentWeatherUseCase`, `GetForecastWeatherUseCase`<br>• `map/` — `GetMapTileUseCase`<br>• `radar/` — `GetRadarUseCase`<br>• `notification/` — `SendPushNotificationUseCase`<br>• `device/` — `RegisterDeviceUseCase`<br>• `subscription/` — `SubscribeToStormUseCase`, `UnsubscribeFromStormUseCase`, `SaveRegionSubscriptionUseCase`<br>• `alert/` — `DetectStormAlertsUseCase` (so trạng thái bão với lần quét trước, tạo và lưu alert), `GetStormAlertsUseCase` (đọc alert theo danh sách storm FE đang theo dõi), `DeliverStormAlertPushUseCase` (đẩy push cho alert đã lưu — bước tách rời, hỏng không làm mất alert) |
| `alertMessages.ts` | Template nội dung alert (tiêu đề/mô tả theo loại alert và giá trị trước/sau). |
| `cacheStatus.ts` | Hằng/helper trạng thái cache (`fresh`/`stale`/`upstream`) trả về trong response. |
| `geo.ts` | Hàm tiện ích hình học (khoảng cách, kiểm tra điểm trong vùng). |
| `stormIdentity.ts` | Chuẩn hóa & parse `stormId` (vd `nhc:AL012026`, `gdacs:TC:...`). |

### `src/adapters/` — Triển khai cụ thể của ports
Mỗi thư mục con = một nguồn/dịch vụ cụ thể.

**`adapters/apns/`** — Apple Push Notification service
- `ApnsPushNotificationRepository.ts`: gửi push thật qua HTTP/2.
- `createApnsHttp2Transport.ts`: tạo transport HTTP/2 khách.
- `signApnsJwt.ts`: ký JWT auth APNs bằng key `.p8`.

**`adapters/cache/`** — Bọc repo nguồn + cache in-memory (TTL/LRU)
- `BoundedTtlLruCache.ts`: cài đặt cache LRU có TTL (dùng chung).
- `CachedStormRepository`, `CachedSpaghettiRepository`, `CachedCurrentWeatherRepository`, `CachedForecastWeatherRepository`, `CachedHistoricalStormTrackRepository`, `CachedMapTileRepository`, `CachedRadarRepository`: mỗi file bọc 1 repo nguồn và thêm cache theo TTL tương ứng.

**`adapters/fixture/`** — Dữ liệu giả cố định (chỉ dùng khi `STORM_DATA_MODE=fixture`)
- `FixtureStormRepository`, `FixtureSpaghettiRepository`, `FixtureWeatherRepository`, `FixtureMapTileRepository`, `FixtureRadarRepository`: trả dữ liệu bão/thời tiết/map/radar giả ổn định.
- `FixturePushNotificationRepository`: push "giả" (không gửi đâu cả).
- `FixtureDeviceRepository`, `FixtureStormSubscriptionRepository`, `FixtureRegionSubscriptionRepository`: lưu trữ giả trong bộ nhớ.

**`adapters/gdacs/`** — Nguồn bão GDACS (châu Âu)
- `GdacsStormRepository.ts`, `GdacsStormConeRepository.ts`: lấy danh sách bão & cone từ GDACS.
- `parseGdacsStormId.ts`, `parseGdacsTrackGeometry.ts`: parse id/geometry từ response GDACS.

**`adapters/mongo/`** — Lưu trữ MongoDB (Mongoose)
- `connectMongo.ts`: kết nối Mongo (chạy nền, không block khởi động).
- `models.ts`: schema Mongoose (devices, subscriptions, storm_states, storm_alerts, alert_deliveries…).
- `MongoDeviceRepository`, `MongoStormSubscriptionRepository`, `MongoRegionSubscriptionRepository`, `MongoStormStateRepository`, `MongoStormAlertRepository`, `MongoAlertDeliveryRepository`: triển khai ports lưu Mongo.
- `runMongoOperation.ts`: helper chạy thao tác Mongo an toàn, trả `StorageUnavailableError` nếu chưa connect.

**`adapters/nhc/`** — Nguồn bão NHC (Mỹ, NOAA)
- `NhcStormRepository.ts`: danh sách bão đang hoạt động.
- `NhcHistoricalStormTrackRepository.ts`: lịch sử track bão quá khứ.
- `NhcSpaghettiRepository.ts`: mô hình spaghetti (đa kịch bản).
- `extractKmlFromKmz.ts`: giải nén KML từ file KMZ.
- `parseNhcAidDeck.ts`, `parseNhcBestTrackDeck.ts`, `parseNhcBestTrackKml.ts`, `parseNhcForecastConeKml.ts`, `parseNhcForecastTrackKml.ts`: parse các định dạng KML/deck của NHC.

**`adapters/openweather/`** — OpenWeather (thời tiết & map tile)
- `OpenWeatherCurrentWeatherRepository.ts`, `OpenWeatherForecastRepository.ts`, `OpenWeatherMapTileRepository.ts`: thời tiết hiện tại, dự báo, bản đồ.
- `openWeatherFields.ts`: ánh xạ tên trường OpenWeather.

**`adapters/rainviewer/`** — Radar mưa RainViewer
- `RainViewerRadarRepository.ts`: lấy ảnh/lớp radar.

**`adapters/scheduler/`** — Bộ lập lịch nền
- `startAlertScheduler.ts`: vòng lặp gọi `DetectStormAlertsUseCase` rồi `DeliverStormAlertPushUseCase` mỗi `ALERTS_POLL_INTERVAL_MS`.

**`adapters/storm/`** — Composite & test wrapper
- `CompositeStormRepository.ts`: gộp NHC + GDACS thành 1 nguồn bão duy nhất.
- `CompositeHistoricalStormTrackRepository.ts`: gộp NHC + GDACS cho lịch sử track.
- `TestableActiveStormsRepository.ts`: bọc repo bão, cho phép "ẩn" 1 bão (dùng bởi endpoint test dissipate khi `STORM_ALERT_TEST_MODE=true`).

### `src/http/` — Lớp HTTP (Express)
| File | Ý nghĩa |
|------|---------|
| `Server.ts` | Khai báo & đăng ký mọi route (`/v1/storms`, `/v1/weather/...`, `/v1/map-tiles/...`, `/v1/radar`, `/v1/notifications/send`, `/v1/devices`, `/v1/storm-subscriptions`, `/v1/region-subscriptions`, `/health`), xử lý lỗi theo từng loại, và mount route test dissipate nếu có `testModeState`. |
| `ClientError.ts` | Lỗi 4xx chuẩn (`code`/`reason`) trả về client. |
| `formatResponseData.ts` | Bọc response chuẩn `{ ok, data, cacheStatus }`. |
| `formatStormSummaryResponse.ts`, `formatStormTrackResponse.ts`, `formatTrackedStormResponse.ts` | Format từng loại dữ liệu bão sang JSON trả client. |
| `getStormArea.ts` | Tính vùng (bounding box) của 1 bão để lấy map tile/radar. |
| `RateLimiter.ts` | Giới hạn request theo IP (sliding window) — bật/tắt qua `RATE_LIMIT_ENABLED`. |

---

## 4. `test/` — Test & fixtures
- `*.test.ts` (vd `Server.test.ts`, `DetectStormAlertsUseCase.test.ts`, `CachedStormRepository.test.ts`, `DissipateStorm.test.ts`…): test chạy bằng `tsx --test`.
- `fixtures/` — dữ liệu mẫu phục vụ test: `gdacs/*.json` (event list/geometry/track), `nhc/*.json` & `*.kml` (current storms, best-track, forecast cone/track).

---

## 5. `docs/` — Tài liệu thiết kế & API
- `API.md`, `api-contract.md`, `API-REFERENCE.md`, `Tutorial-api.md`: tài liệu API.
- `api-source-assessment.md`: đánh giá nguồn dữ liệu (NHC/GDACS/OpenWeather).
- `decisions.md`: các quyết định kiến trúc.
- `SUMMARY.md`: tóm tắt dự án.
- `FORECAST-WEATHER-PRESENT.md`, `HISTORICAL-STORM-TRACK-PROPOSAL.md`, `LAYER-MAP-PRESENT.md`, `STORM-TRACKING-PRESENTATING.md`: ghi chú trình bày từng tính năng.
- `superpowers/plans/*.md`, `superpowers/specs/*.md`: bản kế hoạch & thiết kế chi tiết từng pha phát triển (spec-driven development).

## 6. `.superpowers/` — Artifacts quy trình SDD
- `sdd/2026-08-06-openweather-2-5-free/`: tiến trình phát triển tính năng OpenWeather 2.5 free — `progress.md` (theo dõi) và `task-*.md` (brief/report/review từng task). Do skill `superpowers` sinh ra, không phải code chạy.

## 7. `deploy/` — Cấu hình deploy
- `nginx/storm-api.conf`: file cấu hình site nginx cho VPS staging (reverse proxy `127.0.0.1:3001` → app, chỉ nội bộ, không lộ Internet).

## 8. `credentials/apns/` — Key APNs
- `AuthKey_LMBGTB2F89.p8`: private key APNs (**bí mật, không commit** — chỉ mount vào container qua volume).
- `.gitkeep`: giữ thư mục rỗng trên git.

## 9. `postman/` — Bộ test API
- `Soosky-Storm-API.postman_collection.json`: collection Postman gọi các endpoint thật.
- `Soosky-Storm-API-Cone-Not-Available-Mock.postman_collection.json`: collection mock khi chưa có cone.

---

## 10. Luồng request (tóm tắt)
```
HTTP request
  → src/http/Server.ts (validate, rate-limit)
  → src/domain/use-cases/* (nghiệp vụ, gọi qua ports)
  → src/adapters/* (lấy/ghi dữ liệu: NHC/GDACS/Mongo/OpenWeather/APNs…)
  → response format (src/http/format*.ts) → client
```
Mọi kết nối external được "lắp" ở `src/app.ts`, nên muốn đổi nguồn/dịch vụ chỉ sửa adapter + composition root, không động đến use-case hay HTTP layer.
