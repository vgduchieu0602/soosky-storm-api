# Task 3 Report: OpenWeather 2.5 Free Documentation and Configuration

## Changed files

- `.env.example`
- `docs/API.md`
- `docs/Tutorial-api.md`
- `docs/FORECAST-WEATHER-PRESENT.md`
- `docs/SUMMARY.md`
- `docs/api-contract.md`

## Behavioral statements added or corrected

- Forecast Weather uses OpenWeather 2.5 Free current weather at `https://api.openweathermap.org/data/2.5/weather` and the five-day, three-hour forecast at `https://api.openweathermap.org/data/2.5/forecast`.
- Development and production use the single `OPENWEATHER_API_KEY` variable name; local uses `.env` and production uses a deployment secret. Only the secret value differs, with no `NODE_ENV` branch and no source or response change on deployment.
- The API key remains backend-only and is never returned to FE.
- Successful forecast responses are cached for 24 hours by `lat`, `lon`, and `units`.
- `hourly` is a legacy name: it contains the current point and three-hour forecast points, not one value per hour.
- `daily` is the backend UTC-day aggregate of forecast points: mean temperature/humidity, maximum `pop`, and latest wind/visibility.
- OpenWeather 2.5 Free `uvi` is always `null`; testers must treat that as expected.
- `rain1hMm` is only current-weather `rain.1h`. Forecast `rain.3h` is not relabelled, so hourly forecast and daily `rain1hMm` are `null`.
- Missing values are `null`, never `0`; all forecast samples now use `uvi: null`.

## Verification

Command run:

```powershell
rg -n "One Call 4\\.0|one_call_4|timeline/1h|timeline/1day" .env.example docs
```

Outcome: active files changed for this task have no matches. The command still reports pre-existing matches outside Task 3 scope in `docs/api-source-assessment.md` and dated `docs/superpowers/specs/2026-08-06-*` / `docs/superpowers/plans/2026-08-06-*` records, in addition to immutable 2026-08-05 historical records. Those files were not modified because the brief limits changes to the six listed files and prohibits changing historical records.

## Self-review and concerns

- No real key was added; `.env.example` contains only `your_openweather_api_key`.
- No source code or tests were changed by this task.
- The shared worktree was already dirty, including unrelated source/test changes and a pre-existing `.env.example` index change; these were preserved.
- The only verification concern is the out-of-scope active/historical documentation matches described above.

## Authorized correction

- Updated `docs/api-source-assessment.md` to assess OpenWeather 2.5 Free current weather and five-day/three-hour forecast endpoints, free-key authentication, no-UVI behavior, `rain.3h` versus `rain1hMm`, and the implemented 24-hour backend cache.

## Updated verification

The exact `rg` command was rerun after the authorized correction. Its remaining matches are only dated records under `docs/superpowers/specs/2026-08-05-*`, `docs/superpowers/plans/2026-08-05-*`, and dated 2026-08-06 historical design/plan records. No active non-historical documentation or `.env.example` match remains.

## Round 1 review fix

- Replaced the duplicate legacy Forecast Weather section in `docs/api-contract.md` with a link to the single implemented contract in section 13. The removed duplicate documented unsupported `hourlyHours`/`dailyDays` inputs and an obsolete non-null UVI sample.
- Verification command: `rg -n "hourlyHours|dailyDays|uvi: 7\\.1" docs/api-contract.md`
- Outcome: no matches (exit code 1), confirming the obsolete fields and sample were removed.
