import StormCone from "../entities/StormCone.js";

export { StormConeRepository as default };

interface StormConeRepository {
    getStormCone (stormId: string): Promise<StormCone>;
}
