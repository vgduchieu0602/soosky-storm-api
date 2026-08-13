import Radar from "../../domain/entities/Radar.js";
import { cloneWithCacheStatus, markCacheStatus } from "../../domain/cacheStatus.js";
import RadarRepository from "../../domain/repositories/IRadarRepository.js";

interface CachedRadar {
    expiresAt: number;
    value: Radar;
}

export { CachedRadarRepository as default };

class CachedRadarRepository implements RadarRepository {
    private _radar: CachedRadar | null = null;

    public constructor (
        private readonly _source: RadarRepository,
        private readonly _ttlMs: number,
        private readonly _now: () => number = Date.now,
    ) {}

    public async getRadar (): Promise<Radar> {
        const now = this._now();

        if (this._radar && now < this._radar.expiresAt) {
            return cloneWithCacheStatus(this._radar.value, "cached");
        }

        const expiresAt = now + this._ttlMs;
        const radar = await this._source.getRadar();
        const value = markCacheStatus<Radar>({
            ...radar,
            cachedUntil: new Date(expiresAt).toISOString(),
        }, "upstream");

        this._radar = { expiresAt, value };

        return value;
    }
}
