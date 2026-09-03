import StormSummary from "../../entities/storm/StormSummary.js";
import { StormSource } from "../../entities/storm/StormSummary.js";

export { ActiveStormsRepository as default };

interface ActiveStormsRepository {
    getActiveStorms (source?: StormSource): Promise<StormSummary[]>;
}
