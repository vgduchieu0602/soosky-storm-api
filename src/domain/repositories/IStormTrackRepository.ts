import StormTrack from "../entities/StormTrack.js";

export { StormTrackRepository as default };

interface StormTrackRepository {
    getStormTrack (stormId: string): Promise<StormTrack>;
}
