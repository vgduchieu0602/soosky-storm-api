import Radar from "../../../domain/entities/radar/Radar.js";
import RadarRepository from "../../../domain/repositories/radar/IRadarRepository.js";

class GetRadarUseCase {
    public constructor (
        private readonly _radarRepository: RadarRepository,
    ) {}

    public execute (): Promise<Radar> {
        return this._radarRepository.getRadar();
    }
}

export { GetRadarUseCase as default };
