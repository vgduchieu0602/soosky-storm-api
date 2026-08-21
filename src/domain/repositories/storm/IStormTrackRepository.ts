import StormTrack from "../../entities/storm/StormTrack.js";

export { StormTrackRepository as default };

interface StormTrackRepository {
    getStormTrack (stormId: string): Promise<StormTrack>;
}
