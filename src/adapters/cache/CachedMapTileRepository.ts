import MapTile, { MapTileQuery } from "../../domain/entities/MapTile.js";
import MapTileRepository from "../../domain/repositories/IMapTileRepository.js";

const MAX_ENTRIES = 500;

interface CachedMapTile {
    expiresAt: number;
    value: MapTile;
}

export { CachedMapTileRepository as default };

class CachedMapTileRepository implements MapTileRepository {
    private readonly _tiles = new Map<string, CachedMapTile>();

    public constructor (
        private readonly _source: MapTileRepository,
        private readonly _ttlMs: number,
        private readonly _now: () => number = Date.now,
    ) {}

    public async getTile (query: MapTileQuery): Promise<MapTile> {
        const key = query.layer + ":" + query.z + ":" + query.x + ":" + query.y;
        const now = this._now();
        const cached = this._tiles.get(key);

        if (cached && now < cached.expiresAt) {
            this._tiles.delete(key);
            this._tiles.set(key, cached);
            return cached.value;
        }

        const value = await this._source.getTile(query);

        this._tiles.set(key, { expiresAt: now + this._ttlMs, value });
        this._evict(now);

        return value;
    }

    private _evict (now: number): void {
        for (const [key, cached] of this._tiles) {
            if (now >= cached.expiresAt) {
                this._tiles.delete(key);
            }
        }

        while (this._tiles.size > MAX_ENTRIES) {
            const oldestKey = this._tiles.keys().next().value;

            if (oldestKey === undefined) {
                return;
            }

            this._tiles.delete(oldestKey);
        }
    }
}
