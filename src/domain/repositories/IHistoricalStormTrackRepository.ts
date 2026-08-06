import HistoricalStormTrack from "../entities/HistoricalStormTrack.js";

export { HistoricalStormTrackRepository as default };

interface HistoricalStormTrackRepository {
    getHistoricalStormTrack (stormId: string): Promise<HistoricalStormTrack>;
}
