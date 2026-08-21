import HistoricalStormTrack from "../../domain/entities/storm/HistoricalStormTrack.js";
import HistoricalStormTrackRepository from "../../domain/repositories/storm/IHistoricalStormTrackRepository.js";
import { GDACS_STORM_ID_PREFIX } from "./CompositeStormRepository.js";

export { CompositeHistoricalStormTrackRepository as default };

class CompositeHistoricalStormTrackRepository implements HistoricalStormTrackRepository {
    public constructor (
        private readonly _nhc: HistoricalStormTrackRepository,
        private readonly _gdacs: HistoricalStormTrackRepository,
    ) {}

    public getHistoricalStormTrack (stormId: string): Promise<HistoricalStormTrack> {
        if (stormId.startsWith(GDACS_STORM_ID_PREFIX)) {
            return this._gdacs.getHistoricalStormTrack(stormId);
        }

        return this._nhc.getHistoricalStormTrack(stormId);
    }
}
