import StormCone from "../../entities/storm/StormCone.js";

export { StormConeRepository as default };

interface StormConeRepository {
    getStormCone (stormId: string): Promise<StormCone>;
}
