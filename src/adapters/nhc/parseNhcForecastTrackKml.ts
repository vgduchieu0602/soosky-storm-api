import { XMLParser } from "fast-xml-parser";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import { StormCategory } from "../../domain/entities/StormSummary.js";
import { StormTrackPoint } from "../../domain/entities/StormTrack.js";

export {
    getStormCategoryFromWindSpeed,
    parseNhcForecastTrackKml as default,
};

function parseNhcForecastTrackKml (kml: string, issuedAt: string): StormTrackPoint[] {
    const issuedAtTimestamp = Date.parse(issuedAt);

    if (Number.isNaN(issuedAtTimestamp)) {
        throw new StormProviderError("NHC forecast advisory time is invalid.");
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        trimValues: true,
    });
    const document = parser.parse(kml);
    const placemarks: Record<string, unknown>[] = [];

    collectPlacemarks(document, placemarks);

    return placemarks
        .map((placemark) => parsePlacemark(placemark, issuedAtTimestamp))
        .filter((point): point is StormTrackPoint => point !== null)
        .sort((left, right) => (left.forecastHour ?? 0) - (right.forecastHour ?? 0));
}

function getStormCategoryFromWindSpeed (windSpeed: number | null): StormCategory | null {
    if (windSpeed === null || windSpeed <= 63) {
        return null;
    }

    if (windSpeed <= 82) {
        return "category_1";
    }

    if (windSpeed <= 95) {
        return "category_2";
    }

    if (windSpeed <= 112) {
        return "category_3";
    }

    if (windSpeed <= 136) {
        return "category_4";
    }

    return "category_5";
}

function collectPlacemarks (value: unknown, placemarks: Record<string, unknown>[]): void {
    if (Array.isArray(value)) {
        for (const item of value) {
            collectPlacemarks(item, placemarks);
        }

        return;
    }

    if (!isRecord(value)) {
        return;
    }

    for (const [key, child] of Object.entries(value)) {
        if (key === "Placemark") {
            for (const placemark of toArray(child)) {
                if (isRecord(placemark)) {
                    placemarks.push(placemark);
                }
            }

            continue;
        }

        collectPlacemarks(child, placemarks);
    }
}

function parsePlacemark (
    placemark: Record<string, unknown>,
    issuedAtTimestamp: number,
): StormTrackPoint | null {
    const description = asString(placemark.description);
    const forecastHourMatch = description?.match(/(\d+)\s*hr\s+Forecast/i);

    if (!description || !forecastHourMatch) {
        return null;
    }

    const forecastHour = Number(forecastHourMatch[1]);
    const coordinates = asString(readRecord(placemark.Point)?.coordinates);

    if (!Number.isInteger(forecastHour) || forecastHour <= 0 || !coordinates) {
        throw new StormProviderError("NHC forecast placemark is invalid.");
    }

    const [lon, lat] = parseCoordinates(coordinates);
    const windSpeedMatch = description.match(/Maximum Wind:\s*(\d+)\s*knots/i);
    const windSpeed = windSpeedMatch ? Number(windSpeedMatch[1]) : null;

    return {
        lat,
        lon,
        datetime: new Date(issuedAtTimestamp + forecastHour * 3_600_000).toISOString(),
        forecastHour,
        windSpeed,
        category: getStormCategoryFromWindSpeed(windSpeed),
    };
}

function parseCoordinates (rawCoordinates: string): [number, number] {
    const firstCoordinate = rawCoordinates.trim().split(/\s+/)[0];

    if (!firstCoordinate) {
        throw new StormProviderError("NHC forecast coordinates are invalid.");
    }

    const [rawLon, rawLat] = firstCoordinate.split(",");
    const lon = Number(rawLon);
    const lat = Number(rawLat);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new StormProviderError("NHC forecast coordinates are invalid.");
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

function toArray (value: unknown): unknown[] {
    return Array.isArray(value) ? value : [value];
}
