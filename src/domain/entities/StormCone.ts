export { StormCone as default };
export type {
    GeoJsonFeature,
    GeoJsonFeatureCollection,
    GeoJsonGeometry,
    GeoJsonPolygon,
};

interface GeoJsonGeometry {
    type: string;
    coordinates: unknown;
}

interface GeoJsonFeature {
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: GeoJsonGeometry;
}

interface GeoJsonPolygon extends GeoJsonGeometry {
    type: "Polygon";
    coordinates: number[][][];
}

interface GeoJsonFeatureCollection {
    type: "FeatureCollection";
    features: GeoJsonFeature[];
}

interface StormCone {
    stormId: string;
    source: "nhc" | "gdacs";
    issuedAt: string | null;
    cachedUntil: string | null;
    availability: "available" | "not_available" | "not_supported";
    geometryKind: "forecast_cone" | "gdacs_event_area" | null;
    reason?: string;
    geojson: GeoJsonFeature | GeoJsonFeatureCollection | null;
}
