import MapTile, { MapTileQuery } from "../../entities/MapTile.js";
import MapTileRepository from "../../repositories/IMapTileRepository.js";

class GetMapTileUseCase {
    public constructor (
        private readonly _mapTileRepository: MapTileRepository,
    ) {}

    public execute (query: MapTileQuery): Promise<MapTile> {
        return this._mapTileRepository.getTile(query);
    }
}

export { GetMapTileUseCase as default };
