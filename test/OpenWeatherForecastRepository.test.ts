import assert from "node:assert/strict";
import test from "node:test";
import StormProviderError from "../src/domain/errors/StormProviderError.js";
import OpenWeatherForecastRepository from "../src/adapters/openweather/OpenWeatherForecastRepository.js";

test("OpenWeather forecast repository returns One Call hourly and daily weather conditions unchanged", async () => {
    const requestedUrls: string[] = [];
    const repository = new OpenWeatherForecastRepository("secret-key", async (input) => {
        const url = String(input);
        requestedUrls.push(url);

        if (url.includes("/1h")) {
            return Response.json({
                timezone: "Asia/Ho_Chi_Minh",
                data: [{
                    dt: 1785931200,
                    temp: 30.5,
                    humidity: 72,
                    uvi: 7.1,
                    visibility: 10000,
                    wind_speed: 6.2,
                    wind_deg: 120,
                    pop: 0.45,
                    rain: { "1h": 1.1 },
                    weather: [{
                        id: 800,
                        main: "Clear",
                        description: "clear sky",
                        icon: "01n",
                    }],
                }],
            });
        }

        return Response.json({
            timezone: "Asia/Ho_Chi_Minh",
            data: [{
                dt: 1786017600,
                temp: { day: 31 },
                humidity: 70,
                uvi: 8,
                wind_speed: 5,
                wind_deg: 90,
                pop: 0.4,
                weather: [{
                    id: 500,
                    main: "Rain",
                    description: "light rain",
                    icon: "10d",
                }],
            }],
        });
    });

    const result = await repository.getForecast({ lat: 10.8231, lon: 106.6297, units: "metric" });

    assert.equal(requestedUrls.length, 2);
    assert.equal(requestedUrls.every((url) => url.includes("lat=10.8231") && url.includes("lon=106.6297") && url.includes("units=metric") && url.includes("appid=secret-key")), true);
    assert.deepEqual(requestedUrls.map((url) => new URL(url).pathname).sort(), [
        "/data/4.0/onecall/timeline/1day",
        "/data/4.0/onecall/timeline/1h",
    ]);
    assert.deepEqual(result, {
        location: { lat: 10.8231, lon: 106.6297, timezone: "Asia/Ho_Chi_Minh" },
        units: { temperature: "C", windSpeed: "m/s", visibility: "m", rain: "mm/h" },
        cachedUntil: null,
        hourly: [{
            time: "2026-08-05T12:00:00.000Z",
            temp: 30.5,
            humidity: 72,
            uvi: 7.1,
            visibility: 10000,
            windSpeed: 6.2,
            windDeg: 120,
            windDirection: "ESE",
            pop: 0.45,
            rain1hMm: 1.1,
            weather: [{
                id: 800,
                main: "Clear",
                description: "clear sky",
                icon: "01n",
            }],
        }],
        daily: [{
            time: "2026-08-06T12:00:00.000Z",
            temp: 31,
            humidity: 70,
            uvi: 8,
            visibility: null,
            windSpeed: 5,
            windDeg: 90,
            windDirection: "E",
            pop: 0.4,
            rain1hMm: null,
            weather: [{
                id: 500,
                main: "Rain",
                description: "light rain",
                icon: "10d",
            }],
        }],
    });
});

test("OpenWeather forecast repository rejects a missing weather condition array", async () => {
    const repository = new OpenWeatherForecastRepository("secret-key", async () => Response.json({
        timezone: "Asia/Ho_Chi_Minh",
        data: [{
            dt: 1785931200,
            temp: 30.5,
        }],
    }));

    await assert.rejects(
        repository.getForecast({ lat: 10, lon: 106, units: "metric" }),
        StormProviderError,
    );
});
test("OpenWeather forecast repository maps upstream failures to a provider error", async () => {
    const repository = new OpenWeatherForecastRepository("secret-key", async () => new Response(null, { status: 401 }));

    await assert.rejects(
        repository.getForecast({ lat: 10, lon: 106, units: "metric" }),
        StormProviderError,
    );
});
