import StormCone from "../../entities/storm/StormCone.js";
import StormNotFoundError from "../../errors/StormNotFoundError.js";
import StormConeRepository from "../../repositories/storm/IStormConeRepository.js";

export { GetStormConeUseCase as default };
export type { GetStormConeQuery };

interface GetStormConeQuery {
    stormId: string;
}

class GetStormConeUseCase {
    public constructor (private readonly _stormRepo: StormConeRepository) {}

    public async execute (query: GetStormConeQuery): Promise<StormCone> {
        if (!query.stormId.trim()) {
            throw new StormNotFoundError(query.stormId);
        }

        return this._stormRepo.getStormCone(query.stormId);
    }
}
