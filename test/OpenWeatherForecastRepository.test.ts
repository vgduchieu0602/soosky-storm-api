import assert from "node:assert/strict";
import test from "node:test";
import OpenWeatherForecastRepository from "../src/adapters/openweather/OpenWeatherForecastRepository.js";
import StormProviderError from "../src/domain/errors/StormProviderError.js";

const QUERY = { lat: 10.8231, lon: 106.6297, units: "metric" as const };
const HOUR_SECONDS = 3600;
// 2026-08-09T00:00:00Z, which is 07:00 in the Ho Chi Minh City offset used below.
const FIRST_SLOT = 1_786_233_600;
const OFFSET_SECONDS = 25_200;
// 06:30 local on the day the first slot belongs to, so that day is "today".
const NOW = Date.parse("2026-08-08T23:30:00.000Z");

test("forecast repository maps the 5 day / 3 hour list into hourly points", async () => {
    const requests: string[] = [];
    const repository = new OpenWeatherForecastRepository("key", createFetcher(forecast(), requests), () => NOW);

    const forecastWeather = await repository.getForecast(QUERY);

    assert.equal(requests.length, 1);
    assert.ok(requests[0]?.startsWith("https://api.openweathermap.org/data/2.5/forecast?"));
    assert.deepEqual(forecastWeather.location, { lat: 10.8231, lon: 106.6297, timezone: "Etc/GMT-7" });
    // The next 24 hours: 07:00 local through the 04:00 slot on the next day,
    // whose three-hour interval finishes at 07:00.
    assert.equal(forecastWeather.hourly.length, 8);

    const [first, second] = forecastWeather.hourly;

    assert.equal(first?.time, "2026-08-09T00:00:00.000Z");
    assert.equal(second?.time, "2026-08-09T03:00:00.000Z");
    assert.equal(first?.temp, 27);
    assert.equal(first?.humidity, 80);
    assert.equal(first?.visibility, 10_000);
    assert.equal(first?.windSpeed, 3);
    assert.equal(first?.windDeg, 180);
    assert.equal(first?.windDirection, "S");
    assert.equal(first?.pop, 0.2);
    assert.deepEqual(first?.weather, [{ id: 500, main: "Rain", description: "light rain", icon: "10d" }]);
});

test("forecast repository converts the three-hour rain total into a rate", async () => {
    const repository = new OpenWeatherForecastRepository("key", createFetcher(forecast()), () => NOW);
    const forecastWeather = await repository.getForecast(QUERY);

    // The first slot reports 1.5 mm over three hours.
    assert.equal(forecastWeather.hourly[0]?.rain1hMm, 0.5);
    // A slot without rain keeps null instead of inventing a zero.
    assert.equal(forecastWeather.hourly[1]?.rain1hMm, null);
});

test("forecast repository reports no UV index", async () => {
    const repository = new OpenWeatherForecastRepository("key", createFetcher(forecast()), () => NOW);
    const forecastWeather = await repository.getForecast(QUERY);

    assert.ok(forecastWeather.hourly.every((point) => point.uvi === null));
    assert.ok(forecastWeather.daily.every((point) => point.uvi === null));
});

test("forecast repository folds the three-hour points into daily points", async () => {
    const repository = new OpenWeatherForecastRepository("key", createFetcher(forecast()), () => NOW);
    const forecastWeather = await repository.getForecast(QUERY);

    // 16 slots of three hours starting at 07:00 local span three local days.
    assert.equal(forecastWeather.daily.length, 3);

    const [firstDay] = forecastWeather.daily;

    // Local noon of the first day, expressed in UTC (UTC+07:00).
    assert.equal(firstDay?.time, "2026-08-09T05:00:00.000Z");
    // The slot nearest local noon describes the day.
    assert.equal(firstDay?.temp, 31);
    // The worst probability and wind of the day, and the day's rain total.
    assert.equal(firstDay?.pop, 0.9);
    assert.equal(firstDay?.windSpeed, 8);
    assert.equal(firstDay?.rain1hMm, 3);
});

test("forecast repository keeps every slot that overlaps the next 24 hours", async () => {
    const repository = new OpenWeatherForecastRepository("key", createFetcher(forecast()), () => NOW);
    const forecastWeather = await repository.getForecast(QUERY);

    assert.ok(forecastWeather.hourly.every((point) => {
        const localHour = new Date(Date.parse(point.time) + (OFFSET_SECONDS * 1000)).getUTCHours();

        return localHour >= 0 && localHour <= 22;
    }));
    assert.equal(forecastWeather.hourly.at(-1)?.time, "2026-08-09T21:00:00.000Z");
});

test("forecast repository keeps the slot in progress for the next 24 hours", async () => {
    // 23:30 local: the 22:00 local slot is still running, followed by tomorrow's slots.
    const lateInTheDay = Date.parse("2026-08-09T16:30:00.000Z");
    const repository = new OpenWeatherForecastRepository("key", createFetcher(forecast()), () => lateInTheDay);
    const forecastWeather = await repository.getForecast(QUERY);

    assert.deepEqual(forecastWeather.hourly.map((point) => point.time), [
        "2026-08-09T15:00:00.000Z",
        "2026-08-09T18:00:00.000Z",
        "2026-08-09T21:00:00.000Z",
        "2026-08-10T00:00:00.000Z",
        "2026-08-10T03:00:00.000Z",
        "2026-08-10T06:00:00.000Z",
        "2026-08-10T09:00:00.000Z",
        "2026-08-10T12:00:00.000Z",
        "2026-08-10T15:00:00.000Z",
    ]);
    assert.ok(forecastWeather.daily.length > 0, "daily still covers the coming days");
});

test("forecast repository caps the daily list at five days", async () => {
    const repository = new OpenWeatherForecastRepository("key", createFetcher(forecast(56)), () => NOW);

    assert.equal((await repository.getForecast(QUERY)).daily.length, 5);
});

test("forecast repository maps the requested units", async (context) => {
    const expected: [("standard" | "imperial"), string, string][] = [
        ["standard", "K", "m/s"],
        ["imperial", "F", "mph"],
    ];

    for (const [units, temperature, windSpeed] of expected) {
        await context.test(units, async () => {
            const requests: string[] = [];
            const repository = new OpenWeatherForecastRepository("key", createFetcher(forecast(), requests), () => NOW);
            const forecastWeather = await repository.getForecast({ ...QUERY, units });

            assert.equal(forecastWeather.units.temperature, temperature);
            assert.equal(forecastWeather.units.windSpeed, windSpeed);
            assert.match(requests[0] ?? "", new RegExp("units=" + units));
        });
    }
});

test("forecast repository rejects a missing API key", async () => {
    const repository = new OpenWeatherForecastRepository("", createFetcher(forecast()));

    await assert.rejects(() => repository.getForecast(QUERY), StormProviderError);
});

test("forecast repository rejects an invalid provider response", async (context) => {
    const invalidPayloads: [string, unknown][] = [
        ["not an object", []],
        ["missing list", { city: { timezone: OFFSET_SECONDS } }],
        ["list item not an object", { list: ["nope"], city: { timezone: OFFSET_SECONDS } }],
        ["missing dt", { list: [{ main: { temp: 27 }, weather: [] }], city: { timezone: OFFSET_SECONDS } }],
        ["pop out of range", {
            list: [{ ...slot(0), pop: 1.4 }],
            city: { timezone: OFFSET_SECONDS },
        }],
    ];

    for (const [name, payload] of invalidPayloads) {
        await context.test(name, async () => {
            const repository = new OpenWeatherForecastRepository("key", createFetcher(payload));

            await assert.rejects(() => repository.getForecast(QUERY), StormProviderError);
        });
    }
});

test("forecast repository maps a provider outage to a provider error", async (context) => {
    await context.test("HTTP error", async () => {
        const repository = new OpenWeatherForecastRepository("key", async () => new Response("", { status: 429 }));

        await assert.rejects(() => repository.getForecast(QUERY), StormProviderError);
    });

    await context.test("network error", async () => {
        const repository = new OpenWeatherForecastRepository("key", async () => {
            throw new Error("socket hang up");
        });

        await assert.rejects(() => repository.getForecast(QUERY), StormProviderError);
    });
});

/** Two local days of three-hour slots, matching the shape of the 2.5 forecast payload. */
function forecast (slotCount = 16): Record<string, unknown> {
    return {
        cod: "200",
        cnt: slotCount,
        list: Array.from({ length: slotCount }, (_value, index) => slot(index)),
        city: { name: "Ho Chi Minh City", timezone: OFFSET_SECONDS },
    };
}

function slot (index: number): Record<string, unknown> {
    const localHour = ((index * 3) + 7) % 24;
    // Warmest around local noon so the daily fold has a clear representative.
    const temp = 27 + (localHour >= 11 && localHour <= 14 ? 4 : 0);
    const isStormy = localHour === 13;

    return {
        dt: FIRST_SLOT + (index * 3 * HOUR_SECONDS),
        main: { temp, humidity: 80, pressure: 1007 },
        weather: [{ id: 500, main: "Rain", description: "light rain", icon: "10d" }],
        clouds: { all: 75 },
        wind: { speed: isStormy ? 8 : 3, deg: 180 },
        visibility: 10_000,
        pop: isStormy ? 0.9 : 0.2,
        ...(index % 4 === 0 ? { rain: { "3h": 1.5 } } : {}),
        dt_txt: new Date((FIRST_SLOT + (index * 3 * HOUR_SECONDS)) * 1000).toISOString(),
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
