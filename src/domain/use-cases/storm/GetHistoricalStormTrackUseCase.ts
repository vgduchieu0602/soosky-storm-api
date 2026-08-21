import HistoricalStormTrack from "../../entities/storm/HistoricalStormTrack.js";
import HistoricalStormTrackRepository from "../../repositories/storm/IHistoricalStormTrackRepository.js";

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
