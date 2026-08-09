import StormSummary, { StormSource } from "../../entities/StormSummary.js";
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

        return storms.filter((storm) => storm.source === query.source);
    }
}
