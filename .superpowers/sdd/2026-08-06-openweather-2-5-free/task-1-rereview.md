# Task 1 re-review — OpenWeather 2.5 Free adapter

## Verdict

- Spec: PASS
- Quality: CHANGES_REQUESTED

## Findings

The implementation uses only the 2.5 `/weather` and `/forecast` endpoints, with the required query parameters, and contains no One Call or timeline request path. It maps current conditions and 3-hour forecast records correctly for the retained entity contract: `uvi` is `null`, current `rain["1h"]` becomes `rain1hMm`, forecast `rain["3h"]` is validated but deliberately not represented as one-hour rain, and forecast `pop` is retained. Hourly output is sorted and timestamp-deduplicated with current taking precedence. Daily records are derived only from forecast records, grouped by UTC date, using mean temperature/humidity, latest observation fields, and maximum `pop`. The numeric provider timezone offset is not exposed as an IANA timezone (`null`).

The existing happy-path test verifies both endpoint paths and query parameters, core current/forecast mapping, null UVI, forecast-rain suppression, daily averages/max POP, and provider-error translation. It does not directly test the duplicate-timestamp/current-precedence behavior or UTC day-boundary grouping. Add focused tests for those two required semantics before approval.
