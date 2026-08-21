import CurrentWeather from "../../domain/entities/weather/CurrentWeather.js";
import { cloneWithCacheStatus, markCacheStatus } from "../../domain/services/cacheStatus.js";
import CurrentWeatherRepository, { CurrentWeatherQuery } from "../../domain/repositories/weather/ICurrentWeatherRepository.js";
import BoundedTtlLruCache from "./BoundedTtlLruCache.js";

interface CacheLimits {
    maxEntries: number;
    maxBytes: number;
}

const DEFAULT_CACHE_LIMITS: CacheLimits = { maxEntries: 250, maxBytes: 8 * 1024 * 1024 };

export { CachedCurrentWeatherRepository as default };

class CachedCurrentWeatherRepository implements CurrentWeatherRepository {
    private readonly _observations: BoundedTtlLruCache<CurrentWeather>;

    public constructor (
        private readonly _source: CurrentWeatherRepository,
        private readonly _ttlMs: number,
        private readonly _now: () => number = Date.now,
        limits: CacheLimits = DEFAULT_CACHE_LIMITS,
    ) {
        this._observations = new BoundedTtlLruCache<CurrentWeather>({
            ...limits,
            now: this._now,
            estimateBytes: getJsonByteSize,
        });
    }

    public async getCurrentWeather (query: CurrentWeatherQuery): Promise<CurrentWeather> {
        const key = query.lat + ":" + query.lon + ":" + query.units;
        const now = this._now();
        const cached = this._observations.get(key);

        if (cached) {
            return cloneWithCacheStatus(cached, "cached");
        }

        const expiresAt = now + this._ttlMs;
        const observation = await this._source.getCurrentWeather(query);
        const value = markCacheStatus<CurrentWeather>({
            ...observation,
            cachedUntil: new Date(expiresAt).toISOString(),
        }, "upstream");

        this._observations.set(key, value, this._ttlMs);

        return value;
    }
}

function getJsonByteSize (value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), "utf-8");
}
