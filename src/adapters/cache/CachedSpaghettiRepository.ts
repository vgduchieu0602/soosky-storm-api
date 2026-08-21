import StormSpaghetti from "../../domain/entities/storm/StormSpaghetti.js";
import { cloneWithCacheStatus, markCacheStatus } from "../../domain/services/cacheStatus.js";
import SpaghettiRepository from "../../domain/repositories/storm/ISpaghettiRepository.js";
import BoundedTtlLruCache from "./BoundedTtlLruCache.js";

export { CachedSpaghettiRepository as default };

interface CacheLimits {
    maxEntries: number;
    maxBytes: number;
}

const DEFAULT_CACHE_LIMITS: CacheLimits = { maxEntries: 200, maxBytes: 16 * 1024 * 1024 };

class CachedSpaghettiRepository implements SpaghettiRepository {
    private readonly _values: BoundedTtlLruCache<StormSpaghetti>;

    public constructor (
        private readonly _source: SpaghettiRepository,
        private readonly _ttlMs: number,
        private readonly _now: () => number = Date.now,
        limits: CacheLimits = DEFAULT_CACHE_LIMITS,
    ) {
        this._values = new BoundedTtlLruCache<StormSpaghetti>({
            ...limits,
            now: this._now,
            estimateBytes: getJsonByteSize,
        });
    }

    public async getStormSpaghetti (stormId: string): Promise<StormSpaghetti> {
        const now = this._now();
        const cached = this._values.get(stormId);

        if (cached) {
            return cloneWithCacheStatus(cached, "cached");
        }

        const result = await this._source.getStormSpaghetti(stormId);

        if (result.availability !== "available") {
            return markCacheStatus(result, "upstream");
        }

        const expiresAt = now + this._ttlMs;
        const value = markCacheStatus<StormSpaghetti>({
            ...result,
            cachedUntil: new Date(expiresAt).toISOString(),
        }, "upstream");

        this._values.set(stormId, value, this._ttlMs);

        return value;
    }
}

function getJsonByteSize (value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), "utf-8");
}
