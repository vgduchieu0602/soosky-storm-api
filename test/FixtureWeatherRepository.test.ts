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
    assert.equal(weather.precipitationProbability, 1);
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

test("fixture forecast returns 48 hourly and 10 daily points aligned to the clock", async () => {
    const repository = new FixtureWeatherRepository(() => NOW);
    const forecast = await repository.getForecast({ ...STORM_CENTRE, units: "metric" });

    assert.equal(forecast.hourly.length, 48);
    assert.equal(forecast.daily.length, 10);
    assert.equal(forecast.hourly[0]?.time, "2026-08-08T12:00:00.000Z");
    assert.equal(forecast.hourly[1]?.time, "2026-08-08T13:00:00.000Z");
    assert.equal(forecast.daily[0]?.time, "2026-08-08T12:00:00.000Z");
    assert.equal(forecast.daily[1]?.time, "2026-08-09T12:00:00.000Z");
    assert.equal(forecast.location.timezone, "UTC");
    assert.ok(forecast.hourly.every((point) => point.temp !== null && point.weather.length === 1));
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
