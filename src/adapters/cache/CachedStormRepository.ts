import StormSummary, { StormSource } from "../../domain/entities/storm/StormSummary.js";
import { cloneWithCacheStatus, markCacheStatus } from "../../domain/services/cacheStatus.js";
import StormCone from "../../domain/entities/storm/StormCone.js";
import StormTrack from "../../domain/entities/storm/StormTrack.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import StormRepository from "../../domain/repositories/storm/IStormRepository.js";
import BoundedTtlLruCache from "./BoundedTtlLruCache.js";

export { CachedStormRepository as default };

interface CachedActiveStorms {
    expiresAt: number;
    value: StormSummary[];
}

interface CacheLimits {
    maxEntries: number;
    maxBytes: number;
}

interface StormCacheLimits {
    track: CacheLimits;
    cone: CacheLimits;
}

const DEFAULT_CACHE_LIMITS: StormCacheLimits = {
    track: { maxEntries: 200, maxBytes: 12 * 1024 * 1024 },
    cone: { maxEntries: 40, maxBytes: 32 * 1024 * 1024 },
};

class CachedStormRepository implements StormRepository {
    private readonly _tracks: BoundedTtlLruCache<StormTrack>;
    private readonly _cones: BoundedTtlLruCache<StormCone>;
    private readonly _activeStorms = new Map<StormSource | "all", CachedActiveStorms>();

    public constructor (
        private readonly _source: StormRepository,
        private readonly _ttlMs: number,
        private readonly _activeStormsTtlMs: number,
        private readonly _now: () => number = Date.now,
        limits: StormCacheLimits = DEFAULT_CACHE_LIMITS,
    ) {
        this._tracks = new BoundedTtlLruCache<StormTrack>({
            ...limits.track,
            now: this._now,
            estimateBytes: getJsonByteSize,
        });
        this._cones = new BoundedTtlLruCache<StormCone>({
            ...limits.cone,
            now: this._now,
            estimateBytes: getJsonByteSize,
        });
    }

    public async getActiveStorms (source?: StormSource): Promise<StormSummary[]> {
        const now = this._now();
        const key = source ?? "all";
        const cached = this._activeStorms.get(key);

        if (cached && now < cached.expiresAt) {
            return cloneWithCacheStatus(cached.value, "cached");
        }

        let value: StormSummary[];

        try {
            value = markCacheStatus(await this._source.getActiveStorms(source), "upstream");
        } catch (error) {
            if (cached && error instanceof StormProviderError) {
                return cloneWithCacheStatus(cached.value, "stale");
            }

            throw error;
        }

        this._activeStorms.set(key, {
            expiresAt: now + this._activeStormsTtlMs,
            value,
        });

        return value;
    }

    public async getStormTrack (stormId: string): Promise<StormTrack> {
        const now = this._now();
        const cached = this._tracks.get(stormId);

        if (cached) {
            return cloneWithCacheStatus(cached, "cached");
        }

        const expiresAt = now + this._ttlMs;
        const track = await this._source.getStormTrack(stormId);
        const value = markCacheStatus<StormTrack>({
            ...track,
            cachedUntil: new Date(expiresAt).toISOString(),
        }, "upstream");

        this._tracks.set(stormId, value, this._ttlMs);

        return value;
    }

    public async getStormCone (stormId: string): Promise<StormCone> {
        const now = this._now();
        const cached = this._cones.get(stormId);

        if (cached) {
            return cloneWithCacheStatus(cached, "cached");
        }

        const cone = await this._source.getStormCone(stormId);

        if (cone.availability !== "available") {
            return markCacheStatus(cone, "upstream");
        }

        const expiresAt = now + this._ttlMs;
        const value = markCacheStatus<StormCone>({
            ...cone,
            cachedUntil: new Date(expiresAt).toISOString(),
        }, "upstream");

        this._cones.set(stormId, value, this._ttlMs);

        return value;
    }
}

function getJsonByteSize (value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), "utf-8");
}
