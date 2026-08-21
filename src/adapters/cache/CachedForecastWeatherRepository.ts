import ForecastWeather from "../../domain/entities/weather/ForecastWeather.js";
import { cloneWithCacheStatus, markCacheStatus } from "../../domain/services/cacheStatus.js";
import ForecastWeatherRepository, { ForecastWeatherQuery } from "../../domain/repositories/weather/IForecastWeatherRepository.js";
import BoundedTtlLruCache from "./BoundedTtlLruCache.js";

interface CacheLimits {
    maxEntries: number;
    maxBytes: number;
}

const DEFAULT_CACHE_LIMITS: CacheLimits = { maxEntries: 250, maxBytes: 32 * 1024 * 1024 };

export { CachedForecastWeatherRepository as default };

class CachedForecastWeatherRepository implements ForecastWeatherRepository {
    private readonly _forecasts: BoundedTtlLruCache<ForecastWeather>;

    public constructor (
        private readonly _source: ForecastWeatherRepository,
        private readonly _ttlMs: number,
        private readonly _now: () => number = Date.now,
        limits: CacheLimits = DEFAULT_CACHE_LIMITS,
    ) {
        this._forecasts = new BoundedTtlLruCache<ForecastWeather>({
            ...limits,
            now: this._now,
            estimateBytes: getJsonByteSize,
        });
    }

    public async getForecast (query: ForecastWeatherQuery): Promise<ForecastWeather> {
        const key = query.lat + ":" + query.lon + ":" + query.units;
        const now = this._now();
        const cached = this._forecasts.get(key);

        if (cached) {
            return cloneWithCacheStatus(cached, "cached");
        }

        const expiresAt = now + this._ttlMs;
        const forecast = await this._source.getForecast(query);
        const value = markCacheStatus<ForecastWeather>({
            ...forecast,
            cachedUntil: new Date(expiresAt).toISOString(),
        }, "upstream");

        this._forecasts.set(key, value, this._ttlMs);

        return value;
    }
}

function getJsonByteSize (value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), "utf-8");
}
