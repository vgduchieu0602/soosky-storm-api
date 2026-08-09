import assert from "node:assert/strict";
import test from "node:test";
import CachedCurrentWeatherRepository from "../src/adapters/cache/CachedCurrentWeatherRepository.js";
import CurrentWeather from "../src/domain/entities/CurrentWeather.js";
import CurrentWeatherRepository, { CurrentWeatherQuery } from "../src/domain/repositories/ICurrentWeatherRepository.js";

const TTL_MS = 600_000;

test("Current Weather cache reuses a location and units until its exact expiry", async () => {
    const source = new CountingCurrentWeatherRepository();
    let now = Date.parse("2026-08-08T00:00:00.000Z");
    const repository = new CachedCurrentWeatherRepository(source, TTL_MS, () => now);

    const first = await repository.getCurrentWeather({ lat: 10, lon: 106, units: "metric" });
    const second = await repository.getCurrentWeather({ lat: 10, lon: 106, units: "metric" });

    assert.equal(source.calls, 1);
    assert.equal(first.cachedUntil, "2026-08-08T00:10:00.000Z");
    assert.equal(second.cachedUntil, "2026-08-08T00:10:00.000Z");

    now = Date.parse("2026-08-08T00:09:59.000Z");
    await repository.getCurrentWeather({ lat: 10, lon: 106, units: "metric" });

    assert.equal(source.calls, 1);

    now = Date.parse("2026-08-08T00:10:00.000Z");
    const refreshed = await repository.getCurrentWeather({ lat: 10, lon: 106, units: "metric" });

    assert.equal(source.calls, 2);
    assert.equal(refreshed.cachedUntil, "2026-08-08T00:20:00.000Z");
});

test("Current Weather cache keys on latitude, longitude and units", async () => {
    const source = new CountingCurrentWeatherRepository();
    const repository = new CachedCurrentWeatherRepository(source, TTL_MS, () => 0);

    await repository.getCurrentWeather({ lat: 10, lon: 106, units: "metric" });
    await repository.getCurrentWeather({ lat: 11, lon: 106, units: "metric" });
    await repository.getCurrentWeather({ lat: 10, lon: 107, units: "metric" });
    await repository.getCurrentWeather({ lat: 10, lon: 106, units: "imperial" });
    await repository.getCurrentWeather({ lat: 10, lon: 106, units: "metric" });

    assert.equal(source.calls, 4);
});

test("Current Weather cache evicts the least recently used observation", async () => {
    const source = new CountingCurrentWeatherRepository();
    const repository = new CachedCurrentWeatherRepository(source, TTL_MS, () => 0, {
        maxEntries: 2,
        maxBytes: 1024 * 1024,
    });

    await repository.getCurrentWeather({ lat: 10, lon: 106, units: "metric" });
    await repository.getCurrentWeather({ lat: 11, lon: 106, units: "metric" });
    await repository.getCurrentWeather({ lat: 10, lon: 106, units: "metric" });
    await repository.getCurrentWeather({ lat: 12, lon: 106, units: "metric" });
    await repository.getCurrentWeather({ lat: 11, lon: 106, units: "metric" });

    assert.equal(source.calls, 4);
});

class CountingCurrentWeatherRepository implements CurrentWeatherRepository {
    public calls = 0;

    public async getCurrentWeather (query: CurrentWeatherQuery): Promise<CurrentWeather> {
        this.calls += 1;

        return {
            location: { lat: query.lat, lon: query.lon, timezone: "Asia/Ho_Chi_Minh" },
            units: { temperature: "C", windSpeed: "m/s", visibility: "m", rain: "mm/h" },
            observedAt: "2026-08-08T00:00:00.000Z",
            cachedUntil: null,
            temperature: 28.97,
            humidity: 85,
            uvi: 0,
            visibility: 10_000,
            windSpeed: 4.49,
            windDeg: 239,
            windDirection: "WSW",
            rain1h: null,
            precipitationProbability: 0.35,
            weatherDescription: "overcast clouds",
            weather: [{ id: 804, main: "Clouds", description: "overcast clouds", icon: "04n" }],
        };
    }
}
