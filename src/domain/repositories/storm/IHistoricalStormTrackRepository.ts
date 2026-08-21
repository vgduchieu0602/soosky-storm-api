import HistoricalStormTrack from "../../entities/storm/HistoricalStormTrack.js";

export { HistoricalStormTrackRepository as default };

interface HistoricalStormTrackRepository {
    getHistoricalStormTrack (stormId: string): Promise<HistoricalStormTrack>;
}
