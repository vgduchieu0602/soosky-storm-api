import StormSpaghetti from "../entities/StormSpaghetti.js";

export { SpaghettiRepository as default };

interface SpaghettiRepository {
    getStormSpaghetti (stormId: string): Promise<StormSpaghetti>;
}
