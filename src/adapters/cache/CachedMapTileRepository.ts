import MapTile, { MapTileQuery } from "../../domain/entities/map/MapTile.js";
import { cloneWithCacheStatus, markCacheStatus } from "../../domain/services/cacheStatus.js";
import MapTileRepository from "../../domain/repositories/map/IMapTileRepository.js";
import BoundedTtlLruCache from "./BoundedTtlLruCache.js";

interface CacheLimits {
    maxEntries: number;
    maxBytes: number;
}

const DEFAULT_CACHE_LIMITS: CacheLimits = { maxEntries: 500, maxBytes: 50 * 1024 * 1024 };

export { CachedMapTileRepository as default };

class CachedMapTileRepository implements MapTileRepository {
    private readonly _tiles: BoundedTtlLruCache<MapTile>;

    public constructor (
        private readonly _source: MapTileRepository,
        private readonly _ttlMs: number,
        private readonly _now: () => number = Date.now,
        limits: CacheLimits = DEFAULT_CACHE_LIMITS,
    ) {
        this._tiles = new BoundedTtlLruCache({
            ...limits,
            now: this._now,
            estimateBytes: (tile) => tile.buffer.byteLength,
        });
    }

    public async getTile (query: MapTileQuery): Promise<MapTile> {
        const key = query.layer + ":" + query.z + ":" + query.x + ":" + query.y;
        const cached = this._tiles.get(key);

        if (cached) {
            return cloneWithCacheStatus(cached, "cached");
        }

        const value = markCacheStatus(await this._source.getTile(query), "upstream");

        this._tiles.set(key, value, this._ttlMs);

        return value;
    }
}
