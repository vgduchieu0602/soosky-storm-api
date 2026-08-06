# Task 4 brief — Integration verification

## Goal

Verify that OpenWeather Forecast Weather uses one configuration key behavior in every environment and that the implemented 2.5 Free migration builds/tests correctly without modifying code.

## Scope

Read-only verification only. Do not edit any file, do not run destructive git commands, do not stage/commit.

## Requirements

1. Inspect src/config.ts and src/app.ts.
- config.openWeather.apiKey must read process.env.OPENWEATHER_API_KEY.
- app must pass config.openWeather.apiKey to OpenWeatherForecastRepository and OpenWeatherMapTileRepository.
- There must be no NODE_ENV branch, no alternate OpenWeather key name, and no hard-coded secret in application source.

2. Inspect src/adapters/openweather/OpenWeatherForecastRepository.ts.
- It must use only /data/2.5/weather and /data/2.5/forecast.
- No One Call timeline endpoint is permitted in running source.

3. Run:
```powershell
.\node_modules\.bin\tsx.cmd --test test\OpenWeatherForecastRepository.test.ts test\Server.test.ts test\CachedForecastWeatherRepository.test.ts test\ForecastWeatherUseCases.test.ts
npm.cmd run build
```

4. Optionally run npm.cmd test only after scoped tests. If full suite fails, identify whether the failure belongs to Forecast Weather or pre-existing/concurrent unrelated history/cache work. Do not fix unrelated failures.

5. Run:
```powershell
rg -n "data/4\.0/onecall|timeline/1h|timeline/1day|NODE_ENV" src\app.ts src\config.ts src\adapters\openweather\OpenWeatherForecastRepository.ts
git diff --check
```

## Report

Write report with commands/outcomes and an explicit PASS/FAIL per requirement using apply_patch:
.superpowers/sdd/2026-08-06-openweather-2-5-free/task-4-report.md

If any failure is out of scope, include exact test name/error and clearly classify it. Final response only: DONE/BLOCKED, one-line verification, report path.

