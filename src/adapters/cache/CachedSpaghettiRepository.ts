import StormSpaghetti from "../../domain/entities/StormSpaghetti.js";
import SpaghettiRepository from "../../domain/repositories/ISpaghettiRepository.js";

export { CachedSpaghettiRepository as default };

interface CachedSpaghetti {
    expiresAt: number;
    value: StormSpaghetti;
}

class CachedSpaghettiRepository implements SpaghettiRepository {
    private readonly _values = new Map<string, CachedSpaghetti>();

    public constructor (
        private readonly _source: SpaghettiRepository,
        private readonly _ttlMs: number,
        private readonly _now: () => number = Date.now,
    ) {}

    public async getStormSpaghetti (stormId: string): Promise<StormSpaghetti> {
        const now = this._now();
        const cached = this._values.get(stormId);

        if (cached && now < cached.expiresAt) {
            return cached.value;
        }

        const result = await this._source.getStormSpaghetti(stormId);

        if (result.availability !== "available") {
            return result;
        }

        const expiresAt = now + this._ttlMs;
        const value: StormSpaghetti = {
            ...result,
            cachedUntil: new Date(expiresAt).toISOString(),
        };

        this._values.set(stormId, { expiresAt, value });

        return value;
    }
}
