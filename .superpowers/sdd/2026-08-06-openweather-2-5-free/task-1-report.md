# Task 1 — OpenWeather 2.5 Free adapter migration

## Context

Task 1 replaces the OpenWeather One Call 4.0 forecast adapter with the two OpenWeather 2.5 Free endpoints while retaining the existing forecast entity and repository contract.

## Problem

The previous adapter requested One Call timeline endpoints and interpreted their `data` payloads. Those endpoints and shapes are not available through the intended 2.5 Free integration.

## Key Learning

The 2.5 endpoints separate current conditions from three-hour forecasts. The adapter must combine them for the existing hourly output and derive daily values from forecast data only; the numeric `city.timezone` offset cannot safely be exposed as an IANA timezone.

## Decision

- Changed `src/adapters/openweather/OpenWeatherForecastRepository.ts` to request exactly `/data/2.5/weather` and `/data/2.5/forecast` concurrently with `lat`, `lon`, `units`, and `appid`.
- Retained JSON headers, the existing user agent, 10-second timeout, and `StormProviderError` translation for network, non-OK, and JSON failures.
- Mapped current `main`, `wind`, visibility, and optional `rain["1h"]`; mapped forecast `list` items including optional `pop` and validated optional `rain["3h"]` while always outputting forecast `rain1hMm: null`.
- All emitted 2.5 points use `uvi: null`; location timezone is `null`.
- Combined current and forecast points by ISO time, sorted and deduplicated timestamps with current retained; generated UTC-date daily aggregates from forecast points only (means, latest observation fields, and max pop).
- Replaced the adapter test with 2.5 fixtures validating endpoint paths/query parameters, combined mapping, null UVI, current rain, forecast rain suppression, daily mean temperature `31`, daily max pop `0.7`, and HTTP 401 mapping.

## Action Items

- Focused test attempted: `.\node_modules\.bin\tsx.cmd --test test\OpenWeatherForecastRepository.test.ts`.
- Outcome: blocked before tests loaded by Node/tsx sandbox failure: `uv_os_get_passwd returned ENOMEM (not enough memory)` from `node:os`; no test assertions executed. An earlier elevated retry was interrupted while waiting for user approval.
- Self-review: no One Call URLs or pagination logic remain; scope changes are confined to the adapter and its test. Runtime test verification remains pending outside the sandbox.

## Related Notes

- [[OpenWeather 2.5 Free migration]]

## Reviewer follow-up

- Added a focused regression test for a current/forecast timestamp collision. It verifies the de-duplicated hourly result retains the current response values, including current-only `rain1hMm`.
- Added a UTC-midnight aggregation test with two forecast points on each side of midnight. It verifies two daily aggregates, their UTC-date earliest timestamps, per-day mean temperature/humidity, latest observation fields, and maximum `pop`.
- Per coordination instruction, runtime execution was not retried because sandbox test execution has already been denied/blocked.
