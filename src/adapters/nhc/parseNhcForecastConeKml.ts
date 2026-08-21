import { XMLParser } from "fast-xml-parser";
import { GeoJsonFeature } from "../../domain/entities/storm/StormCone.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";

export { parseNhcForecastConeKml as default };

function parseNhcForecastConeKml (kml: string, issuedAt: string): GeoJsonFeature {
    if (Number.isNaN(Date.parse(issuedAt))) {
        throw new StormProviderError("NHC cone advisory time is invalid.");
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        trimValues: true,
    });
    const polygon = findPolygon(parser.parse(kml));
    const coordinates = asString(
        readRecord(readRecord(polygon?.outerBoundaryIs)?.LinearRing)?.coordinates,
    );

    if (!coordinates) {
        throw new StormProviderError("NHC cone KML did not contain a polygon.");
    }

    const ring = coordinates
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((coordinate) => parseCoordinate(coordinate));

    if (ring.length < 3) {
        throw new StormProviderError("NHC cone polygon was invalid.");
    }

    const first = ring[0];
    const last = ring.at(-1);

    if (!first || !last) {
        throw new StormProviderError("NHC cone polygon was invalid.");
    }

    if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([...first]);
    }

    if (ring.length < 4) {
        throw new StormProviderError("NHC cone polygon was invalid.");
    }

    return {
        type: "Feature",
        properties: {
            source: "nhc",
            issuedAt,
        },
        geometry: {
            type: "Polygon",
            coordinates: [ring],
        },
    };
}

function findPolygon (value: unknown): Record<string, unknown> | null {
    if (Array.isArray(value)) {
        for (const item of value) {
            const polygon = findPolygon(item);

            if (polygon) {
                return polygon;
            }
        }

        return null;
    }

    if (!isRecord(value)) {
        return null;
    }

    if (isRecord(value.outerBoundaryIs)) {
        return value;
    }

    for (const child of Object.values(value)) {
        const polygon = findPolygon(child);

        if (polygon) {
            return polygon;
        }
    }

    return null;
}

function parseCoordinate (value: string): number[] {
    const [rawLon, rawLat] = value.split(",");
    const lon = Number(rawLon);
    const lat = Number(rawLat);

    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        throw new StormProviderError("NHC cone coordinates were invalid.");
    }

    return [lon, lat];
}

function asString (value: unknown): string | null {
    if (typeof value === "string") {
        return value;
    }

    if (isRecord(value) && typeof value["#text"] === "string") {
        return value["#text"];
    }

    return null;
}

function readRecord (value: unknown): Record<string, unknown> | null {
    return isRecord(value) ? value : null;
}

function isRecord (value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
