import StormTrack from "../../entities/StormTrack.js";
import StormNotFoundError from "../../errors/StormNotFoundError.js";
import StormRepository from "../../repositories/IStormRepository.js";

export { GetStormTrackUseCase as default };
export type { GetStormTrackQuery };

interface GetStormTrackQuery {
    stormId: string;
}

class GetStormTrackUseCase {
    public constructor (private readonly _stormRepo: StormRepository) {}

    public async execute (input: GetStormTrackQuery): Promise<StormTrack> {
        if (!input.stormId.trim()) {
            throw new StormNotFoundError(input.stormId);
        }

        return this._stormRepo.getStormTrack(input.stormId);
    }
}
