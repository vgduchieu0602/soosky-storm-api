import StormSummary from "../../domain/entities/StormSummary.js";
import StormCone from "../../domain/entities/StormCone.js";
import StormTrack from "../../domain/entities/StormTrack.js";
import StormRepository from "../../domain/repositories/IStormRepository.js";
import BoundedTtlLruCache from "./BoundedTtlLruCache.js";

export { CachedStormRepository as default };

interface CachedActiveStorms {
    expiresAt: number;
    value: StormSummary[];
}

const ACTIVE_STORMS_CACHE_TTL_MS = 43_200_000;

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
    private _activeStorms: CachedActiveStorms | null = null;

    public constructor (
        private readonly _source: StormRepository,
        private readonly _ttlMs: number,
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

    public async getActiveStorms (): Promise<StormSummary[]> {
        const now = this._now();

        if (this._activeStorms && now < this._activeStorms.expiresAt) {
            return this._activeStorms.value;
        }

        const value = await this._source.getActiveStorms();

        this._activeStorms = {
            expiresAt: now + ACTIVE_STORMS_CACHE_TTL_MS,
            value,
        };

        return value;
    }

    public async getStormTrack (stormId: string): Promise<StormTrack> {
        const now = this._now();
        const cached = this._tracks.get(stormId);

        if (cached) {
            return cached;
        }

        const expiresAt = now + this._ttlMs;
        const track = await this._source.getStormTrack(stormId);
        const value: StormTrack = {
            ...track,
            cachedUntil: new Date(expiresAt).toISOString(),
        };

        this._tracks.set(stormId, value, this._ttlMs);

        return value;
    }

    public async getStormCone (stormId: string): Promise<StormCone> {
        const now = this._now();
        const cached = this._cones.get(stormId);

        if (cached) {
            return cached;
        }

        const cone = await this._source.getStormCone(stormId);

        if (cone.availability !== "available") {
            return cone;
        }

        const expiresAt = now + this._ttlMs;
        const value: StormCone = {
            ...cone,
            cachedUntil: new Date(expiresAt).toISOString(),
        };

        this._cones.set(stormId, value, this._ttlMs);

        return value;
    }
}

function getJsonByteSize (value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), "utf-8");
}
