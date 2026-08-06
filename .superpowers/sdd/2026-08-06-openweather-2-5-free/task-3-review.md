# Task 3 Review: OpenWeather 2.5 Free Documentation and Configuration

## Verdict

FAIL — the active documentation contains a conflicting, unmarked legacy Forecast Weather contract.

## Finding

- `docs/api-contract.md:L211-L249`: the section titled `Forecast weather` is not dated or labelled historical, but still documents unsupported `hourlyHours` / `dailyDays` query parameters and samples `uvi: 7.1`. This conflicts with the current 2.5 Free contract at L462-L533, which requires `uvi: null` and exposes only `lat`, `lon`, and `units`. Mark the earlier section clearly historical or replace it with the implemented contract.

## Verified

- `.env.example` has only the placeholder `OPENWEATHER_API_KEY=your_openweather_api_key` and the required local/deployment-secret guidance; no real OpenWeather key was found in the reviewed scope.
- Current Forecast Weather sections in `API.md`, `Tutorial-api.md`, `FORECAST-WEATHER-PRESENT.md`, `SUMMARY.md`, and `api-source-assessment.md` correctly state the 2.5 current (`/data/2.5/weather`) and five-day/three-hour forecast (`/data/2.5/forecast`) sources.
- These current sections consistently document one environment variable name across local and production, no `NODE_ENV` deployment branch, backend-only key handling, a successful-response cache of 24 hours by `lat`, `lon`, and `units`, the legacy `hourly` semantics, UTC-day `daily` aggregation, `uvi: null`, correct `rain.1h` / `rain.3h` handling, and `null` rather than `0` for missing values.
- The required deprecated-source search has no matches in active non-historical documentation or `.env.example`; remaining matches are in dated historical design/plan records.
- No documentation diff outside the authorized Task 3 documentation files was present in the worktree. Unrelated `.env.example` configuration changes are pre-existing/shared-worktree changes and are not attributed to this task.
