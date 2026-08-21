import StormSpaghetti from "../../entities/storm/StormSpaghetti.js";

export { SpaghettiRepository as default };

interface SpaghettiRepository {
    getStormSpaghetti (stormId: string): Promise<StormSpaghetti>;
}
