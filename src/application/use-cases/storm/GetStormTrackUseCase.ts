import StormTrack from "../../../domain/entities/storm/StormTrack.js";
import StormNotFoundError from "../../../domain/errors/StormNotFoundError.js";
import StormRepository from "../../../domain/repositories/storm/IStormRepository.js";

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
