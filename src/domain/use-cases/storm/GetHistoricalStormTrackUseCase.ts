import HistoricalStormTrack from "../../entities/HistoricalStormTrack.js";
import HistoricalStormTrackRepository from "../../repositories/IHistoricalStormTrackRepository.js";

export { GetHistoricalStormTrackUseCase as default };
export type { GetHistoricalStormTrackQuery };

interface GetHistoricalStormTrackQuery {
    stormId: string;
}

class GetHistoricalStormTrackUseCase {
    public constructor (private readonly _historicalStormTrackRepo: HistoricalStormTrackRepository) {}

    public async execute (input: GetHistoricalStormTrackQuery): Promise<HistoricalStormTrack> {
        return this._historicalStormTrackRepo.getHistoricalStormTrack(input.stormId);
    }
}
