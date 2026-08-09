import assert from "node:assert/strict";
import test from "node:test";
import OpenWeatherCurrentWeatherRepository from "../src/adapters/openweather/OpenWeatherCurrentWeatherRepository.js";
import StormProviderError from "../src/domain/errors/StormProviderError.js";

const API_KEY = "test-key";
const CURRENT_URL = "https://api.openweathermap.org/data/4.0/onecall/current";
const HOURLY_URL = "https://api.openweathermap.org/data/4.0/onecall/timeline/1h";
const QUERY = { lat: 10.8231, lon: 106.6297, units: "metric" } as const;

test("OpenWeather current weather repository normalizes the observation and the current-hour probability", async () => {
    const requestedUrls: string[] = [];
    const repository = new OpenWeatherCurrentWeatherRepository(API_KEY, async (input) => {
        const url = String(input);

        requestedUrls.push(url);

        if (url.startsWith(CURRENT_URL)) {
            return new Response(JSON.stringify(currentPayload()), { status: 200 });
        }

        return new Response(JSON.stringify(hourlyPayload(0.35)), { status: 200 });
    });

    assert.deepEqual(await repository.getCurrentWeather(QUERY), {
        location: { lat: 10.8231, lon: 106.6297, timezone: "Asia/Ho_Chi_Minh" },
        units: { temperature: "C", windSpeed: "m/s", visibility: "m", rain: "mm/h" },
        observedAt: "2026-08-08T17:21:51.000Z",
        cachedUntil: null,
        temperature: 28.97,
        humidity: 85,
        uvi: 0,
        visibility: 10_000,
        windSpeed: 4.49,
        windDeg: 239,
        windDirection: "WSW",
        rain1h: 1.2,
        precipitationProbability: 0.35,
        weatherDescription: "overcast clouds",
        weather: [{ id: 804, main: "Clouds", description: "overcast clouds", icon: "04n" }],
    });
    assert.equal(requestedUrls.length, 2);
    assert.ok(requestedUrls.some((url) => url.startsWith(CURRENT_URL)));
    assert.ok(requestedUrls.some((url) => url.startsWith(HOURLY_URL)));
});

test("OpenWeather current weather repository sends the requested coordinates and units", async () => {
    const requestedUrls: string[] = [];
    const repository = new OpenWeatherCurrentWeatherRepository(API_KEY, async (input) => {
        requestedUrls.push(String(input));
        return new Response(JSON.stringify(currentPayload()), { status: 200 });
    });

    await repository.getCurrentWeather({ lat: -33.87, lon: 151.21, units: "imperial" });

    const currentUrl = new URL(requestedUrls.find((url) => url.startsWith(CURRENT_URL)) ?? "");

    assert.equal(currentUrl.searchParams.get("lat"), "-33.87");
    assert.equal(currentUrl.searchParams.get("lon"), "151.21");
    assert.equal(currentUrl.searchParams.get("units"), "imperial");
    assert.equal(currentUrl.searchParams.get("appid"), API_KEY);
});

test("OpenWeather current weather repository reports imperial units", async () => {
    const repository = new OpenWeatherCurrentWeatherRepository(API_KEY, async () => {
        return new Response(JSON.stringify(currentPayload()), { status: 200 });
    });

    const observation = await repository.getCurrentWeather({ ...QUERY, units: "imperial" });

    assert.deepEqual(observation.units, { temperature: "F", windSpeed: "mph", visibility: "m", rain: "mm/h" });
});

test("OpenWeather current weather repository leaves unavailable fields null instead of inventing them", async () => {
    const repository = new OpenWeatherCurrentWeatherRepository(API_KEY, async (input) => {
        if (String(input).startsWith(CURRENT_URL)) {
            return new Response(JSON.stringify({
                timezone: "Asia/Ho_Chi_Minh",
                data: [{
                    dt: 1_786_209_711,
                    weather: [{ id: 804, main: "Clouds", description: "overcast clouds", icon: "04n" }],
                }],
            }), { status: 200 });
        }

        return new Response(JSON.stringify(hourlyPayload(null)), { status: 200 });
    });

    const observation = await repository.getCurrentWeather(QUERY);

    assert.deepEqual(
        {
            temperature: observation.temperature,
            humidity: observation.humidity,
            uvi: observation.uvi,
            visibility: observation.visibility,
            windSpeed: observation.windSpeed,
            windDeg: observation.windDeg,
            windDirection: observation.windDirection,
            rain1h: observation.rain1h,
            precipitationProbability: observation.precipitationProbability,
        },
        {
            temperature: null,
            humidity: null,
            uvi: null,
            visibility: null,
            windSpeed: null,
            windDeg: null,
            windDirection: null,
            rain1h: null,
            precipitationProbability: null,
        },
    );
});

test("OpenWeather current weather repository keeps the observation when the probability lookup fails", async () => {
    const repository = new OpenWeatherCurrentWeatherRepository(API_KEY, async (input) => {
        if (String(input).startsWith(CURRENT_URL)) {
            return new Response(JSON.stringify(currentPayload()), { status: 200 });
        }

        return new Response(null, { status: 503 });
    });

    const observation = await repository.getCurrentWeather(QUERY);

    assert.equal(observation.temperature, 28.97);
    assert.equal(observation.precipitationProbability, null);
});

test("OpenWeather current weather repository drops a probability outside the 0..1 range", async () => {
    const repository = new OpenWeatherCurrentWeatherRepository(API_KEY, async (input) => {
        if (String(input).startsWith(CURRENT_URL)) {
            return new Response(JSON.stringify(currentPayload()), { status: 200 });
        }

        return new Response(JSON.stringify(hourlyPayload(4)), { status: 200 });
    });

    assert.equal((await repository.getCurrentWeather(QUERY)).precipitationProbability, null);
});

test("OpenWeather current weather repository requires an API key", async () => {
    const repository = new OpenWeatherCurrentWeatherRepository("  ", async () => {
        throw new Error("must not be called");
    });

    await assert.rejects(repository.getCurrentWeather(QUERY), StormProviderError);
});

test("OpenWeather current weather repository rejects malformed observations", async (context) => {
    const malformedPayloads = [
        { data: [] },
        { data: "not-an-array" },
        { data: [null] },
        { data: [{ weather: [] }] },
        { data: [{ dt: "not-a-number", weather: [] }] },
        { data: [{ dt: 1_786_209_711 }] },
    ];

    for (const [index, payload] of malformedPayloads.entries()) {
        await context.test("payload " + index, async () => {
            const repository = new OpenWeatherCurrentWeatherRepository(API_KEY, async () => {
                return new Response(JSON.stringify(payload), { status: 200 });
            });

            await assert.rejects(repository.getCurrentWeather(QUERY), StormProviderError);
        });
    }
});

test("OpenWeather current weather repository maps upstream failures to provider errors", async (context) => {
    await context.test("HTTP failure", async () => {
        const repository = new OpenWeatherCurrentWeatherRepository(API_KEY, async () => new Response(null, { status: 500 }));

        await assert.rejects(repository.getCurrentWeather(QUERY), StormProviderError);
    });

    await context.test("invalid JSON", async () => {
        const repository = new OpenWeatherCurrentWeatherRepository(API_KEY, async () => {
            return new Response("<html>error</html>", { status: 200 });
        });

        await assert.rejects(repository.getCurrentWeather(QUERY), StormProviderError);
    });

    await context.test("network failure", async () => {
        const repository = new OpenWeatherCurrentWeatherRepository(API_KEY, async () => {
            throw new Error("network unavailable");
        });

        await assert.rejects(repository.getCurrentWeather(QUERY), StormProviderError);
    });
});

function currentPayload (): Record<string, unknown> {
    return {
        lat: 10.8231,
        lon: 106.6297,
        timezone: "Asia/Ho_Chi_Minh",
        timezone_offset: 25_200,
        data: [{
            dt: 1_786_209_711,
            sunrise: 1_786_228_982,
            sunset: 1_786_274_109,
            temp: 28.97,
            feels_like: 35.77,
            pressure: 1009,
            humidity: 85,
            dew_point: 26.19,
            uvi: 0,
            clouds: 99,
            visibility: 10_000,
            wind_speed: 4.49,
            wind_deg: 239,
            wind_gust: 11.11,
            rain: { "1h": 1.2 },
            weather: [{ id: 804, main: "Clouds", description: "overcast clouds", icon: "04n" }],
        }],
    };
}

function hourlyPayload (pop: number | null): Record<string, unknown> {
    return {
        timezone: "Asia/Ho_Chi_Minh",
        data: [{
            dt: 1_786_208_400,
            temp: 28.97,
            pop,
            weather: [{ id: 804, main: "Clouds", description: "overcast clouds", icon: "04n" }],
        }],
    };
}
