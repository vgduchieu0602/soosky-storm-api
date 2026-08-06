import { XMLParser } from "fast-xml-parser";
import HistoricalStormTrack from "../../domain/entities/HistoricalStormTrack.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import { getStormCategoryFromWindSpeed } from "./parseNhcForecastTrackKml.js";

export { parseNhcBestTrackKml as default };

type HistoricalStormTrackPoint = HistoricalStormTrack["history"][number];

function parseNhcBestTrackKml (kml: string): HistoricalStormTrackPoint[] {
    const parser = new XMLParser({
        ignoreAttributes: false,
        trimValues: true,
    });
    let document: unknown;

    try {
        document = parser.parse(kml);
    } catch (error) {
        throw new StormProviderError("NHC best-track KML could not be parsed.", { cause: error });
    }

    const placemarks: Record<string, unknown>[] = [];
    collectPlacemarks(document, placemarks);
    const history = placemarks
        .map((placemark) => parsePlacemark(placemark))
        .filter((point): point is HistoricalStormTrackPoint => point !== null)
        .sort((left, right) => Date.parse(left.datetime) - Date.parse(right.datetime));

    if (!history.length) {
        throw new StormProviderError("NHC best-track KML did not contain valid point history.");
    }

    return history;
}

function collectPlacemarks (value: unknown, placemarks: Record<string, unknown>[]): void {
    if (Array.isArray(value)) {
        value.forEach((item) => collectPlacemarks(item, placemarks));
        return;
    }

    if (!isRecord(value)) {
        return;
    }

    for (const [key, child] of Object.entries(value)) {
        if (key === "Placemark") {
            toArray(child).forEach((placemark) => {
                if (isRecord(placemark)) {
                    placemarks.push(placemark);
                }
            });
            continue;
        }

        collectPlacemarks(child, placemarks);
    }
}

function parsePlacemark (placemark: Record<string, unknown>): HistoricalStormTrackPoint | null {
    const coordinates = asString(readRecord(placemark.Point)?.coordinates);

    if (!coordinates) {
        return null;
    }

    const [lon, lat] = parseCoordinates(coordinates);
    const datetime = parseDatetime(placemark);
    const description = asString(placemark.description) ?? "";
    const windSpeed = parseWindSpeed(description);

    return {
        lat,
        lon,
        datetime,
        windSpeed,
        category: getStormCategoryFromWindSpeed(windSpeed),
    };
}

function parseCoordinates (rawCoordinates: string): [number, number] {
    const coordinate = rawCoordinates.trim().split(/\s+/)[0];
    const [rawLon, rawLat] = coordinate?.split(",") ?? [];
    const lon = Number(rawLon);
    const lat = Number(rawLat);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new StormProviderError("NHC best-track coordinates were invalid.");
    }

    return [lon, lat];
}

function parseDatetime (placemark: Record<string, unknown>): string {
    const timestamp = asString(readRecord(placemark.TimeStamp)?.when)
        ?? findDatetime(asString(placemark.name) ?? "")
        ?? findDatetime(asString(placemark.description) ?? "");

    if (!timestamp) {
        throw new StormProviderError("NHC best-track point time was invalid.");
    }

    const date = parseNhcDatetime(timestamp);

    if (!date) {
        throw new StormProviderError("NHC best-track point time was invalid.");
    }

    return date.toISOString();
}

function findDatetime (value: string): string | null {
    const normalized = value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ");
    const match = normalized.match(/\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:Z|UTC)?\b/i)
        ?? normalized.match(/\b\d{10}(?:\d{2})?\b/);

    return match?.[0] ?? null;
}

function parseNhcDatetime (value: string): Date | null {
    const compact = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})?$/.exec(value.trim());

    if (compact) {
        const [, year, month, day, hour, minute = "00"] = compact;
        const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
        const date = new Date(timestamp);

        return Number.isNaN(date.getTime()) ? null : date;
    }

    const timestamp = Date.parse(value.replace(/\s+UTC$/i, "Z"));

    return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function parseWindSpeed (description: string): number | null {
    const text = description.replace(/<[^>]+>/g, " ");
    const match = text.match(/(?:Maximum\s+Wind|Wind\s+Speed|Wind)\s*:\s*(\d+)\s*(?:knots?|kt)\b/i);

    return match ? Number(match[1]) : null;
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
