import StormCone from "../../domain/entities/StormCone.js";
import StormSummary from "../../domain/entities/StormSummary.js";
import StormTrack from "../../domain/entities/StormTrack.js";
import StormConeRepository from "../../domain/repositories/IStormConeRepository.js";
import StormRepository from "../../domain/repositories/IStormRepository.js";

export { CompositeStormRepository as default };

class CompositeStormRepository implements StormRepository {
    public constructor (
        private readonly _nhc: StormRepository,
        private readonly _gdacs: StormConeRepository,
    ) {}

    public getActiveStorms (): Promise<StormSummary[]> {
        return this._nhc.getActiveStorms();
    }

    public getStormTrack (stormId: string): Promise<StormTrack> {
        return this._nhc.getStormTrack(stormId);
    }

    public getStormCone (stormId: string): Promise<StormCone> {
        if (stormId.startsWith("gdacs:TC:")) {
            return this._gdacs.getStormCone(stormId);
        }

        return this._nhc.getStormCone(stormId);
    }
}
