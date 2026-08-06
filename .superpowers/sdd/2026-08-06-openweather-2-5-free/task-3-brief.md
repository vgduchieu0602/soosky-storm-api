# Task 3 brief — OpenWeather 2.5 Free configuration and documents

## Goal

Make user-facing and technical Forecast Weather documentation accurately describe implemented OpenWeather 2.5 Free behavior and safe development/production key separation.

## Files in scope

- Modify: .env.example
- Modify: docs/API.md
- Modify: docs/Tutorial-api.md
- Modify: docs/FORECAST-WEATHER-PRESENT.md
- Modify: docs/SUMMARY.md
- Modify: docs/api-contract.md

Do not edit source or tests. Do not modify immutable historical records under docs/superpowers/specs/2026-08-05-* or docs/superpowers/plans/2026-08-05-*. Do not commit; shared workspace is dirty.

## Required content

1. .env.example must contain this safe guidance, with no real key:

```dotenv
# OpenWeather 2.5 Free Forecast Weather and OpenWeather map tiles.
# Local: set your free key in .env. Production: set the same variable as a deployment secret.
OPENWEATHER_API_KEY=your_openweather_api_key
```

Do not add .env.production.

2. In every relevant Forecast Weather section, running implementation uses:
- https://api.openweathermap.org/data/2.5/weather for current weather.
- https://api.openweathermap.org/data/2.5/forecast for 5 days, one point per 3 hours.
- one OPENWEATHER_API_KEY name in both develop and production; only its secret value differs.
- no NODE_ENV branch, no source/response change when deploying, and key never returned to FE.
- cache successful response 24 hours.

3. Explain public response honestly:
- hourly contains current point plus 3-hour forecast points; despite its legacy name it is not one value per hour.
- daily is backend aggregate from forecast points grouped by UTC day: temperature/humidity mean, pop maximum, latest wind/visibility.
- uvi is always null in OpenWeather 2.5 Free.
- rain1hMm exists only for current weather when rain.1h is supplied. Forecast rain.3h must not be labelled rain1hMm, so hourly forecast and daily rain1hMm are null.
- missing values are null, never 0. Tester must treat uvi null as expected.

4. Update Forecast Weather samples so they no longer show non-null UVI from OpenWeather 2.5. Keep API URL/input/units unchanged.

5. In docs/SUMMARY.md, change source from One Call 4.0 to OpenWeather 2.5 Free and make freshness/cache recommendation actual 24-hour cache (do not leave old 30-60 minute/no-24h advice for implemented endpoint).

6. In docs/api-contract.md, preserve historical planning content where clearly dated, but update currently implemented Forecast Weather contract so it no longer claims One Call 4.0.

7. Do not change unrelated storm, cone, spaghetti, map or radar documentation.

## Verification

Run:
```powershell
rg -n "One Call 4\\.0|one_call_4|timeline/1h|timeline/1day" .env.example docs
```

Expected: matches only immutable historical records under docs/superpowers/specs/2026-08-05-* and docs/superpowers/plans/2026-08-05-*; no active document or .env.example match.

## Report

Write detailed report using apply_patch:
.superpowers/sdd/2026-08-06-openweather-2-5-free/task-3-report.md

Include changed files, exact behavioral statements added, command/outcome, confirmation no key or source code changed, self-review and concerns. Return only DONE/BLOCKED, one-line result, report path.

