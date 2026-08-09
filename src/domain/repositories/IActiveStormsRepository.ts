import StormSummary from "../entities/StormSummary.js";

export { ActiveStormsRepository as default };

interface ActiveStormsRepository {
    getActiveStorms (): Promise<StormSummary[]>;
}
