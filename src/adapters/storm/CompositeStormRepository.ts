import StormCone from "../../domain/entities/storm/StormCone.js";
import StormSummary, { StormSource } from "../../domain/entities/storm/StormSummary.js";
import StormTrack from "../../domain/entities/storm/StormTrack.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import ActiveStormsRepository from "../../domain/repositories/storm/IActiveStormsRepository.js";
import StormConeRepository from "../../domain/repositories/storm/IStormConeRepository.js";
import StormRepository from "../../domain/repositories/storm/IStormRepository.js";
import StormTrackRepository from "../../domain/repositories/storm/IStormTrackRepository.js";

export { CompositeStormRepository as default };
export { GDACS_STORM_ID_PREFIX };

const GDACS_STORM_ID_PREFIX = "gdacs:TC:";

interface GdacsStormSource extends ActiveStormsRepository, StormTrackRepository {}

class CompositeStormRepository implements StormRepository {
    public constructor (
        private readonly _nhc: StormRepository,
        private readonly _gdacsCone: StormConeRepository,
        private readonly _gdacs: GdacsStormSource | null = null,
        private readonly _logError: (message: string) => void = (message) => console.error(message),
    ) {}

    public async getActiveStorms (source?: StormSource): Promise<StormSummary[]> {
        if (source === "nhc") {
            return this._nhc.getActiveStorms();
        }

        if (source === "gdacs") {
            if (!this._gdacs) {
                throw new StormProviderError("GDACS active storm provider is unavailable.");
            }

            return this._gdacs.getActiveStorms();
        }

        // One provider being down must not hide the other provider's storms, so
        // the combined list only fails when every provider fails.
        const sources: ActiveStormsRepository[] = this._gdacs ? [this._nhc, this._gdacs] : [this._nhc];
        const results = await Promise.allSettled(sources.map((source) => source.getActiveStorms()));
        const storms: StormSummary[] = [];
        const failures: unknown[] = [];

        for (const result of results) {
            if (result.status === "fulfilled") {
                storms.push(...result.value);
                continue;
            }

            failures.push(result.reason);
            this._logError("Active storm provider failed: " + toErrorMessage(result.reason));
        }

        if (failures.length === results.length) {
            throw failures[0];
        }

        return storms;
    }

    public getStormTrack (stormId: string): Promise<StormTrack> {
        if (this._gdacs && stormId.startsWith(GDACS_STORM_ID_PREFIX)) {
            return this._gdacs.getStormTrack(stormId);
        }

        return this._nhc.getStormTrack(stormId);
    }

    public getStormCone (stormId: string): Promise<StormCone> {
        if (stormId.startsWith(GDACS_STORM_ID_PREFIX)) {
            return this._gdacsCone.getStormCone(stormId);
        }

        return this._nhc.getStormCone(stormId);
    }
}

function toErrorMessage (error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
