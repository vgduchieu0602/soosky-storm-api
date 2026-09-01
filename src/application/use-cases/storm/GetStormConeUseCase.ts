import StormCone from "../../../domain/entities/storm/StormCone.js";
import StormNotFoundError from "../../../domain/errors/StormNotFoundError.js";
import StormConeRepository from "../../../domain/repositories/storm/IStormConeRepository.js";

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
