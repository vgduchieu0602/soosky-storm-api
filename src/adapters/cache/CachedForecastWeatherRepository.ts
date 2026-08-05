import ForecastWeather from "../../domain/entities/ForecastWeather.js";
import ForecastWeatherRepository, { ForecastWeatherQuery } from "../../domain/repositories/IForecastWeatherRepository.js";

interface CachedForecast {
    expiresAt: number;
    value: ForecastWeather;
}

export { CachedForecastWeatherRepository as default };

class CachedForecastWeatherRepository implements ForecastWeatherRepository {
    private readonly _forecasts = new Map<string, CachedForecast>();

    public constructor (
        private readonly _source: ForecastWeatherRepository,
        private readonly _ttlMs: number,
        private readonly _now: () => number = Date.now,
    ) {}

    public async getForecast (query: ForecastWeatherQuery): Promise<ForecastWeather> {
        const key = query.lat + ":" + query.lon + ":" + query.units;
        const now = this._now();
        const cached = this._forecasts.get(key);

        if (cached && now < cached.expiresAt) {
            return cached.value;
        }

        const expiresAt = now + this._ttlMs;
        const forecast = await this._source.getForecast(query);
        const value: ForecastWeather = {
            ...forecast,
            cachedUntil: new Date(expiresAt).toISOString(),
        };

        this._forecasts.set(key, { expiresAt, value });

        return value;
    }
}
