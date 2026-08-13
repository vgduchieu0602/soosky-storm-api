import HistoricalStormTrack from "../../domain/entities/HistoricalStormTrack.js";
import HistoricalStormTrackRepository from "../../domain/repositories/IHistoricalStormTrackRepository.js";
import BoundedTtlLruCache from "./BoundedTtlLruCache.js";

export { CachedHistoricalStormTrackRepository as default };

interface CacheLimits {
    maxEntries: number;
    maxBytes: number;
}

const DEFAULT_CACHE_LIMITS: CacheLimits = { maxEntries: 200, maxBytes: 16 * 1024 * 1024 };

class CachedHistoricalStormTrackRepository implements HistoricalStormTrackRepository {
    private readonly _tracks: BoundedTtlLruCache<HistoricalStormTrack>;

    public constructor (
        private readonly _source: HistoricalStormTrackRepository,
        private readonly _ttlMs: number,
        private readonly _now: () => number = Date.now,
        limits: CacheLimits = DEFAULT_CACHE_LIMITS,
    ) {
        this._tracks = new BoundedTtlLruCache<HistoricalStormTrack>({
            ...limits,
            now: this._now,
            estimateBytes: getJsonByteSize,
        });
    }

    public async getHistoricalStormTrack (stormId: string): Promise<HistoricalStormTrack> {
        const cached = this._tracks.get(stormId);

        if (cached) {
            return cached;
        }

        const track = await this._source.getHistoricalStormTrack(stormId);

        if (track.availability !== "available") {
            return track;
        }

        const expiresAt = this._now() + this._ttlMs;
        const value: HistoricalStormTrack = {
            ...track,
            cachedUntil: new Date(expiresAt).toISOString(),
        };

        this._tracks.set(stormId, value, this._ttlMs);

        return value;
    }
}

function getJsonByteSize (value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), "utf-8");
}
