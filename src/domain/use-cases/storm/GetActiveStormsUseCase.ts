import StormSummary, { StormSource } from "../../entities/StormSummary.js";
import { getCacheStatus, markCacheStatus } from "../../cacheStatus.js";
import ActiveStormsRepository from "../../repositories/IActiveStormsRepository.js";

export { GetActiveStormsUseCase as default };
export type { GetActiveStormsQuery };

interface GetActiveStormsQuery {
    source?: StormSource;
}

class GetActiveStormsUseCase {
    public constructor (private readonly _stormRepo: ActiveStormsRepository) {}

    public async execute (query: GetActiveStormsQuery = {}): Promise<StormSummary[]> {
        const storms = await this._stormRepo.getActiveStorms();

        if (!query.source) {
            return storms;
        }

        const filtered = storms.filter((storm) => storm.source === query.source);
        const cacheStatus = getCacheStatus(storms);

        return cacheStatus === null ? filtered : markCacheStatus(filtered, cacheStatus);
    }
}
