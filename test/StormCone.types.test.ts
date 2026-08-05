import StormCone from "../src/domain/entities/StormCone.js";

const gdacsCone: StormCone = {
    stormId: "gdacs:TC:1001298:2",
    source: "gdacs",
    issuedAt: null,
    cachedUntil: null,
    availability: "available",
    geometryKind: "gdacs_event_area",
    geojson: {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: {
                    Class: "Poly_Cones",
                },
                geometry: {
                    type: "Polygon",
                    coordinates: [],
                },
            },
        ],
    },
};

void gdacsCone;
