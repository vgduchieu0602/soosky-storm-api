import StormSummary from "../entities/StormSummary.js";
import StormTrack from "../entities/StormTrack.js";
import StormConeRepository from "./IStormConeRepository.js";

export { StormRepository as default };

interface StormRepository extends StormConeRepository {
    getActiveStorms (): Promise<StormSummary[]>;
    getStormTrack (stormId: string): Promise<StormTrack>;
}
