import MapTile, { MapTileQuery } from "../../entities/map/MapTile.js";

interface MapTileRepository {
    getTile (query: MapTileQuery): Promise<MapTile>;
}

export { MapTileRepository as default };
