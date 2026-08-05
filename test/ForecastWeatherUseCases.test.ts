import assert from "node:assert/strict";
import test from "node:test";
import ForecastWeather from "../src/domain/entities/ForecastWeather.js";
import ForecastWeatherRepository, { ForecastWeatherQuery } from "../src/domain/repositories/IForecastWeatherRepository.js";
import GetForecastWeatherUseCase from "../src/domain/use-cases/weather/GetForecastWeatherUseCase.js";

test("Forecast Weather use case delegates the requested location and units", async () => {
    const repository = new MemoryForecastWeatherRepository();
    const useCase = new GetForecastWeatherUseCase(repository);

    await useCase.execute({ lat: 10.8231, lon: 106.6297, units: "metric" });

    assert.deepEqual(repository.queries, [{ lat: 10.8231, lon: 106.6297, units: "metric" }]);
});

test("Forecast Weather use case returns the normalized forecast unchanged", async () => {
    const repository = new MemoryForecastWeatherRepository();
    const useCase = new GetForecastWeatherUseCase(repository);

    assert.deepEqual(
        await useCase.execute({ lat: 10.8231, lon: 106.6297, units: "metric" }),
        repository.forecast,
    );
});

class MemoryForecastWeatherRepository implements ForecastWeatherRepository {
    public readonly queries: ForecastWeatherQuery[] = [];

    public readonly forecast: ForecastWeather = {
        location: {
            lat: 10.8231,
            lon: 106.6297,
            timezone: "Asia/Ho_Chi_Minh",
        },
        units: {
            temperature: "C",
            windSpeed: "m/s",
            visibility: "m",
            rain: "mm/h",
        },
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
            rain1hMm: null,
        }],
        daily: [],
    };

    public async getForecast (query: ForecastWeatherQuery): Promise<ForecastWeather> {
        this.queries.push(query);
        return this.forecast;
    }
}
