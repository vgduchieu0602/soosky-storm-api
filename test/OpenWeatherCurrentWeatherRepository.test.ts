import assert from "node:assert/strict";
import test from "node:test";
import OpenWeatherCurrentWeatherRepository from "../src/adapters/openweather/OpenWeatherCurrentWeatherRepository.js";
import StormProviderError from "../src/domain/errors/StormProviderError.js";

const QUERY = { lat: 10.8231, lon: 106.6297, units: "metric" as const };

test("current weather repository maps a Current Weather Data 2.5 observation", async () => {
    const requests: string[] = [];
    const repository = new OpenWeatherCurrentWeatherRepository("key", createFetcher(observation(), requests));

    const weather = await repository.getCurrentWeather(QUERY);

    assert.equal(requests.length, 1);
    assert.ok(requests[0]?.startsWith("https://api.openweathermap.org/data/2.5/weather?"));
    assert.match(requests[0] ?? "", /lat=10.8231&lon=106.6297&units=metric&appid=key/);

    assert.deepEqual(weather.location, { lat: 10.8231, lon: 106.6297, timezone: "Etc/GMT-7" });
    assert.deepEqual(weather.units, { temperature: "C", windSpeed: "m/s", visibility: "m", rain: "mm/h" });
    assert.equal(weather.observedAt, "2026-08-09T01:39:20.000Z");
    assert.equal(weather.temperature, 30.2);
    assert.equal(weather.humidity, 74);
    assert.equal(weather.visibility, 10_000);
    assert.equal(weather.windSpeed, 4.6);
    assert.equal(weather.windDeg, 230);
    assert.equal(weather.windDirection, "SW");
    assert.equal(weather.rain1h, 1.2);
    assert.equal(weather.weatherDescription, "moderate rain");
    assert.deepEqual(weather.weather, [{ id: 501, main: "Rain", description: "moderate rain", icon: "10d" }]);
});

test("current weather repository reports no UV index and no precipitation probability", async () => {
    const repository = new OpenWeatherCurrentWeatherRepository("key", createFetcher(observation()));
    const weather = await repository.getCurrentWeather(QUERY);

    assert.equal(weather.uvi, null);
    assert.equal(weather.precipitationProbability, null);
});

test("current weather repository leaves missing optional fields null", async () => {
    const sparse = observation();

    delete sparse.rain;
    delete sparse.wind;
    delete sparse.visibility;

    const repository = new OpenWeatherCurrentWeatherRepository("key", createFetcher(sparse));
    const weather = await repository.getCurrentWeather(QUERY);

    assert.equal(weather.rain1h, null);
    assert.equal(weather.windSpeed, null);
    assert.equal(weather.windDeg, null);
    assert.equal(weather.windDirection, null);
    assert.equal(weather.visibility, null);
});

test("current weather repository maps the requested units", async (context) => {
    const expected: [("standard" | "imperial"), string, string][] = [
        ["standard", "K", "m/s"],
        ["imperial", "F", "mph"],
    ];

    for (const [units, temperature, windSpeed] of expected) {
        await context.test(units, async () => {
            const requests: string[] = [];
            const repository = new OpenWeatherCurrentWeatherRepository("key", createFetcher(observation(), requests));
            const weather = await repository.getCurrentWeather({ ...QUERY, units });

            assert.equal(weather.units.temperature, temperature);
            assert.equal(weather.units.windSpeed, windSpeed);
            assert.match(requests[0] ?? "", new RegExp("units=" + units));
        });
    }
});

test("current weather repository reports a half-hour zone as an unknown timezone", async () => {
    // Kolkata is UTC+05:30, which has no Etc/GMT equivalent.
    const repository = new OpenWeatherCurrentWeatherRepository("key", createFetcher({ ...observation(), timezone: 19_800 }));

    assert.equal((await repository.getCurrentWeather(QUERY)).location.timezone, null);
});

test("current weather repository rejects a missing API key", async () => {
    const repository = new OpenWeatherCurrentWeatherRepository("   ", createFetcher(observation()));

    await assert.rejects(() => repository.getCurrentWeather(QUERY), StormProviderError);
});

test("current weather repository rejects an invalid provider response", async (context) => {
    const invalidPayloads: [string, unknown][] = [
        ["not an object", "nope"],
        ["missing main", { ...observation(), main: undefined }],
        ["missing dt", { ...observation(), dt: undefined }],
        ["missing weather", { ...observation(), weather: undefined }],
        ["non-numeric temp", { ...observation(), main: { temp: "hot", humidity: 74 } }],
    ];

    for (const [name, payload] of invalidPayloads) {
        await context.test(name, async () => {
            const repository = new OpenWeatherCurrentWeatherRepository("key", createFetcher(payload));

            await assert.rejects(() => repository.getCurrentWeather(QUERY), StormProviderError);
        });
    }
});

test("current weather repository maps a provider outage to a provider error", async (context) => {
    await context.test("HTTP error", async () => {
        const repository = new OpenWeatherCurrentWeatherRepository("key", async () => {
            return new Response("", { status: 500 });
        });

        await assert.rejects(() => repository.getCurrentWeather(QUERY), StormProviderError);
    });

    await context.test("network error", async () => {
        const repository = new OpenWeatherCurrentWeatherRepository("key", async () => {
            throw new Error("socket hang up");
        });

        await assert.rejects(() => repository.getCurrentWeather(QUERY), StormProviderError);
    });

    await context.test("invalid JSON", async () => {
        const repository = new OpenWeatherCurrentWeatherRepository("key", async () => {
            return new Response("{ not json", { status: 200, headers: { "content-type": "application/json" } });
        });

        await assert.rejects(() => repository.getCurrentWeather(QUERY), StormProviderError);
    });
});

function observation (): Record<string, unknown> {
    return {
        coord: { lat: 10.8231, lon: 106.6297 },
        weather: [{ id: 501, main: "Rain", description: "moderate rain", icon: "10d" }],
        main: { temp: 30.2, humidity: 74, pressure: 1008 },
        visibility: 10_000,
        wind: { speed: 4.6, deg: 230 },
        rain: { "1h": 1.2 },
        dt: 1_786_239_560,
        timezone: 25_200,
        name: "Ho Chi Minh City",
    };
}

function createFetcher (payload: unknown, requests: string[] = []): typeof fetch {
    return async (input) => {
        requests.push(String(input));

        return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    };
}
