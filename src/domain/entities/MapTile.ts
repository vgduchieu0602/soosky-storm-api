const MAP_LAYERS = ["windSpeed", "temperature", "precipitation"] as const;

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

export { MAP_LAYERS, MapTile as default };
export type { MapLayer, MapTileQuery };
