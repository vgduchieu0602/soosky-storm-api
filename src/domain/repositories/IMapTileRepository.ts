import MapTile, { MapTileQuery } from "../entities/MapTile.js";

interface MapTileRepository {
    getTile (query: MapTileQuery): Promise<MapTile>;
}

export { MapTileRepository as default };
