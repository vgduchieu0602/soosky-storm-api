import StormSummary from "../../entities/storm/StormSummary.js";

export { ActiveStormsRepository as default };

interface ActiveStormsRepository {
    getActiveStorms (): Promise<StormSummary[]>;
}
