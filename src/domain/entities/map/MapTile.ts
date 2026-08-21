const MAP_LAYERS = ["windSpeed", "temperature", "pressure", "precipitation"] as const;
const MAX_MAP_ZOOM = 12;

type MapLayer = (typeof MAP_LAYERS)[number];

interface MapTileQuery {
    layer: MapLayer;
    z: number;
    x: number;
    y: number;
}

interface MapTile {
    buffer: Buffer;
    contentType: string;
}

export { MAP_LAYERS, MAX_MAP_ZOOM, MapTile as default };
export type { MapLayer, MapTileQuery };
