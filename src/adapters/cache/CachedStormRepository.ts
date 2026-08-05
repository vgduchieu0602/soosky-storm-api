import StormSummary from "../../domain/entities/StormSummary.js";
import StormCone from "../../domain/entities/StormCone.js";
import StormTrack from "../../domain/entities/StormTrack.js";
import StormRepository from "../../domain/repositories/IStormRepository.js";

export { CachedStormRepository as default };

interface CachedTrack {
    expiresAt: number;
    value: StormTrack;
}

interface CachedCone {
    expiresAt: number;
    value: StormCone;
}

interface CachedActiveStorms {
    expiresAt: number;
    value: StormSummary[];
}

const ACTIVE_STORMS_CACHE_TTL_MS = 43_200_000;

class CachedStormRepository implements StormRepository {
    private readonly _tracks = new Map<string, CachedTrack>();
    private readonly _cones = new Map<string, CachedCone>();
    private _activeStorms: CachedActiveStorms | null = null;

    public constructor (
        private readonly _source: StormRepository,
        private readonly _ttlMs: number,
        private readonly _now: () => number = Date.now,
    ) {}

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

        if (cached && now < cached.expiresAt) {
            return cached.value;
        }

        const expiresAt = now + this._ttlMs;
        const track = await this._source.getStormTrack(stormId);
        const value: StormTrack = {
            ...track,
            cachedUntil: new Date(expiresAt).toISOString(),
        };

        this._tracks.set(stormId, { expiresAt, value });

        return value;
    }

    public async getStormCone (stormId: string): Promise<StormCone> {
        const now = this._now();
        const cached = this._cones.get(stormId);

        if (cached && now < cached.expiresAt) {
            return cached.value;
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

        this._cones.set(stormId, { expiresAt, value });

        return value;
    }
}
