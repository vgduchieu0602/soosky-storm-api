import StormSpaghetti from "../../entities/StormSpaghetti.js";
import StormNotFoundError from "../../errors/StormNotFoundError.js";
import SpaghettiRepository from "../../repositories/ISpaghettiRepository.js";

export { GetStormSpaghettiUseCase as default };
export type { GetStormSpaghettiQuery };

interface GetStormSpaghettiQuery {
    stormId: string;
}

class GetStormSpaghettiUseCase {
    public constructor (private readonly _repository: SpaghettiRepository) {}

    public async execute (query: GetStormSpaghettiQuery): Promise<StormSpaghetti> {
        if (!query.stormId.trim()) {
            throw new StormNotFoundError(query.stormId);
        }

        return this._repository.getStormSpaghetti(query.stormId);
    }
}
