import MapTile, { MapTileQuery } from "../../entities/map/MapTile.js";
import MapTileRepository from "../../repositories/map/IMapTileRepository.js";

class GetMapTileUseCase {
    public constructor (
        private readonly _mapTileRepository: MapTileRepository,
    ) {}

    public execute (query: MapTileQuery): Promise<MapTile> {
        return this._mapTileRepository.getTile(query);
    }
}

export { GetMapTileUseCase as default };
