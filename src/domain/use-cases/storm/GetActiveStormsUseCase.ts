import StormSummary from "../../entities/StormSummary.js";
import StormRepository from "../../repositories/IStormRepository.js";

export { GetActiveStormsUseCase as default };

class GetActiveStormsUseCase {
    public constructor (private readonly _stormRepo: StormRepository) {}

    public async execute (): Promise<StormSummary[]> {
        return this._stormRepo.getActiveStorms();
    }
}
