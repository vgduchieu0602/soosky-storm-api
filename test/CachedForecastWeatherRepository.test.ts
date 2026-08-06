import assert from "node:assert/strict";
import test from "node:test";
import CachedForecastWeatherRepository from "../src/adapters/cache/CachedForecastWeatherRepository.js";
import ForecastWeather from "../src/domain/entities/ForecastWeather.js";
import ForecastWeatherRepository, { ForecastWeatherQuery } from "../src/domain/repositories/IForecastWeatherRepository.js";

test("Forecast Weather cache reuses a location and units for 24 hours", async () => {
    const source = new CountingForecastWeatherRepository();
    let now = Date.parse("2026-08-05T00:00:00.000Z");
    const repository = new CachedForecastWeatherRepository(source, 86_400_000, () => now);
    const query = { lat: 10.8231, lon: 106.6297, units: "metric" } as const;

    const first = await repository.getForecast(query);
    const second = await repository.getForecast(query);

    assert.equal(source.calls, 1);
    assert.equal(first.cachedUntil, "2026-08-06T00:00:00.000Z");
    assert.equal(second.cachedUntil, "2026-08-06T00:00:00.000Z");

    now = Date.parse("2026-08-06T00:00:00.000Z");
    await repository.getForecast(query);

    assert.equal(source.calls, 2);
});

test("Forecast Weather cache keeps different units in separate entries", async () => {
    const source = new CountingForecastWeatherRepository();
    const repository = new CachedForecastWeatherRepository(source, 86_400_000);

    await repository.getForecast({ lat: 10, lon: 106, units: "metric" });
    await repository.getForecast({ lat: 10, lon: 106, units: "imperial" });

    assert.equal(source.calls, 2);
});

test("Forecast Weather cache refreshes the least recently used location after reaching its memory capacity", async () => {
    const source = new CountingForecastWeatherRepository();
    const repository = new CachedForecastWeatherRepository(source, 86_400_000, Date.now, { maxEntries: 2, maxBytes: 10_000 });

    await repository.getForecast({ lat: 10, lon: 106, units: "metric" });
    await repository.getForecast({ lat: 11, lon: 106, units: "metric" });
    await repository.getForecast({ lat: 10, lon: 106, units: "metric" });
    await repository.getForecast({ lat: 12, lon: 106, units: "metric" });
    await repository.getForecast({ lat: 11, lon: 106, units: "metric" });

    assert.equal(source.calls, 4);
});

class CountingForecastWeatherRepository implements ForecastWeatherRepository {
    public calls = 0;

    public async getForecast (_query: ForecastWeatherQuery): Promise<ForecastWeather> {
        this.calls += 1;

        return {
            location: { lat: 10.8231, lon: 106.6297, timezone: "Asia/Ho_Chi_Minh" },
            units: { temperature: "C", windSpeed: "m/s", visibility: "m", rain: "mm/h" },
            cachedUntil: null,
            hourly: [],
            daily: [],
        };
    }
}
