import assert from "node:assert/strict";
import test from "node:test";
import FixtureWeatherRepository from "../src/adapters/fixture/FixtureWeatherRepository.js";

const NOW = Date.parse("2026-08-08T12:34:56.000Z");
// Centre of the fixture storm HURRICANE GENEVIEVE (nhc:EP072026).
const STORM_CENTRE = { lat: 19.4, lon: -116.6 };
// Ho Chi Minh City: far from every fixture storm.
const CALM_PLACE = { lat: 10.8231, lon: 106.6297 };

test("fixture weather returns storm conditions at a fixture storm centre", async () => {
    const repository = new FixtureWeatherRepository(() => NOW);
    const weather = await repository.getCurrentWeather({ ...STORM_CENTRE, units: "metric" });

    assert.equal(weather.observedAt, "2026-08-08T12:00:00.000Z");
    assert.deepEqual(weather.units, { temperature: "C", windSpeed: "m/s", visibility: "m", rain: "mm/h" });
    assert.equal(weather.weather[0]?.main, "Thunderstorm");
    assert.ok((weather.windSpeed ?? 0) > 40, "storm centre wind should match the 100 kt fixture storm");
    assert.ok((weather.rain1h ?? 0) > 15);
    // Current Weather Data 2.5 publishes neither, so the fixture matches that shape.
    assert.equal(weather.uvi, null);
    assert.equal(weather.precipitationProbability, null);
    assert.ok((weather.visibility ?? 0) <= 2_000);
    // Wind circles the centre: at the centre itself the bearing is 0°, turned 90° to E.
    assert.equal(weather.windDeg, 90);
    assert.equal(weather.windDirection, "E");
});

test("fixture weather returns a calm day away from every fixture storm", async () => {
    const repository = new FixtureWeatherRepository(() => NOW);
    const weather = await repository.getCurrentWeather({ ...CALM_PLACE, units: "metric" });

    assert.ok(["Clear", "Clouds"].includes(weather.weather[0]?.main ?? ""));
    assert.equal(weather.rain1h, null);
    assert.equal(weather.visibility, 10_000);
    assert.ok((weather.windSpeed ?? 0) < 6);
});

test("fixture weather converts to the requested units", async () => {
    const repository = new FixtureWeatherRepository(() => NOW);
    const metric = await repository.getCurrentWeather({ ...CALM_PLACE, units: "metric" });
    const imperial = await repository.getCurrentWeather({ ...CALM_PLACE, units: "imperial" });
    const standard = await repository.getCurrentWeather({ ...CALM_PLACE, units: "standard" });

    assert.equal(imperial.units.temperature, "F");
    assert.equal(imperial.units.windSpeed, "mph");
    assert.equal(standard.units.temperature, "K");
    assert.equal(imperial.temperature, Math.round(((metric.temperature ?? 0) * 9 / 5 + 32) * 10) / 10);
    assert.equal(standard.temperature, Math.round(((metric.temperature ?? 0) + 273.15) * 10) / 10);
});

test("fixture forecast returns 40 three-hour points folded into 5 days", async () => {
    const repository = new FixtureWeatherRepository(() => NOW);
    const forecast = await repository.getForecast({ ...STORM_CENTRE, units: "metric" });

    assert.equal(forecast.hourly.length, 40);
    assert.equal(forecast.daily.length, 5);
    assert.equal(forecast.hourly[0]?.time, "2026-08-08T12:00:00.000Z");
    assert.equal(forecast.hourly[1]?.time, "2026-08-08T15:00:00.000Z");
    assert.equal(forecast.daily[0]?.time, "2026-08-08T12:00:00.000Z");
    assert.equal(forecast.daily[1]?.time, "2026-08-09T12:00:00.000Z");
    assert.equal(forecast.location.timezone, "UTC");
    assert.ok(forecast.hourly.every((point) => point.temp !== null && point.weather.length === 1));
    assert.ok(forecast.hourly.every((point) => point.uvi === null));
});

test("fixture daily points carry the worst wind and probability of the day", async () => {
    const repository = new FixtureWeatherRepository(() => NOW);
    const forecast = await repository.getForecast({ ...STORM_CENTRE, units: "metric" });
    const day = forecast.daily[1];
    const slots = forecast.hourly.filter((point) => point.time.startsWith("2026-08-09"));

    assert.equal(day?.pop, Math.max(...slots.map((point) => point.pop ?? 0)));
    assert.equal(day?.windSpeed, Math.max(...slots.map((point) => point.windSpeed ?? 0)));
    // The daily rain is the day's total, not a rate.
    assert.ok((day?.rain1hMm ?? 0) > (slots[0]?.rain1hMm ?? 0));
});

test("fixture weather is deterministic for the same clock and coordinates", async () => {
    const repository = new FixtureWeatherRepository(() => NOW);

    assert.deepEqual(
        await repository.getCurrentWeather({ ...STORM_CENTRE, units: "metric" }),
        await repository.getCurrentWeather({ ...STORM_CENTRE, units: "metric" }),
    );
    assert.deepEqual(
        await repository.getForecast({ ...CALM_PLACE, units: "metric" }),
        await repository.getForecast({ ...CALM_PLACE, units: "metric" }),
    );
});
