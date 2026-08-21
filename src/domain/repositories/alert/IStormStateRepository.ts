import StormState from "../../entities/alert/StormState.js";

export { StormStateRepository as default };

interface StormStateRepository {
    listStates (): Promise<StormState[]>;
    saveState (state: StormState): Promise<void>;
    removeState (stormId: string): Promise<void>;
}
