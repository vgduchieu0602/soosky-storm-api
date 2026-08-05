import Radar from "../../entities/Radar.js";
import RadarRepository from "../../repositories/IRadarRepository.js";

class GetRadarUseCase {
    public constructor (
        private readonly _radarRepository: RadarRepository,
    ) {}

    public execute (): Promise<Radar> {
        return this._radarRepository.getRadar();
    }
}

export { GetRadarUseCase as default };
