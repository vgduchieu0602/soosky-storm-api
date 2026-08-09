export { parseGdacsTrackGeometry as default };
export type { GdacsTrackPoint };

interface GdacsTrackPoint {
    timestamp: number;
    datetime: string;
    lat: number;
    lon: number;
}

const TRACK_POINT_CLASS_PREFIX = "Point_Polygon_Point_";
const ONE_DAY_MS = 86_400_000;

/**
 * GDACS draws every timed storm position as a small circle polygon in the event
 * geometry response. Those circles carry the only per-time position data GDACS
 * publishes, so they are the source for both the track and the history track.
 * The per-point stamps (`key` / `polygonlabel`) omit the year, which is why the
 * event start time is needed to resolve it.
 */
function parseGdacsTrackGeometry (payload: unknown, referenceTimestamp: number): GdacsTrackPoint[] {
    if (!isRecord(payload) || !Array.isArray(payload.features)) {
        return [];
    }

    const pointsByKey = new Map<string, GdacsTrackPoint>();

    for (const feature of payload.features) {
        const point = toTrackPoint(feature, referenceTimestamp);

        if (point && !pointsByKey.has(toDedupeKey(point))) {
            pointsByKey.set(toDedupeKey(point), point);
        }
    }

    return [...pointsByKey.values()].sort((left, right) => left.timestamp - right.timestamp);
}

function toDedupeKey (point: GdacsTrackPoint): string {
    return point.datetime + ":" + point.lat + ":" + point.lon;
}

function toTrackPoint (feature: unknown, referenceTimestamp: number): GdacsTrackPoint | null {
    if (!isRecord(feature) || !isRecord(feature.properties)) {
        return null;
    }

    const featureClass = feature.properties.Class;

    if (typeof featureClass !== "string" || !featureClass.startsWith(TRACK_POINT_CLASS_PREFIX)) {
        return null;
    }

    const timestamp = readTimestamp(feature.properties, referenceTimestamp);
    const position = readPosition(feature);

    if (timestamp === null || !position) {
        return null;
    }

    return {
        timestamp,
        datetime: new Date(timestamp).toISOString(),
        lat: position.lat,
        lon: position.lon,
    };
}

function readTimestamp (properties: Record<string, unknown>, referenceTimestamp: number): number | null {
    const stamp = readMonthDayHourMinute(properties.key) ?? readPolygonLabel(properties.polygonlabel);

    if (!stamp) {
        return null;
    }

    const referenceYear = new Date(referenceTimestamp).getUTCFullYear();
    const candidate = toUtcTimestamp(referenceYear, stamp);

    if (candidate === null) {
        return null;
    }

    // A track that crosses new year keeps counting from the previous year's start date.
    if (candidate < referenceTimestamp - ONE_DAY_MS) {
        return toUtcTimestamp(referenceYear + 1, stamp);
    }

    return candidate;
}

interface MonthDayHourMinute {
    month: number;
    day: number;
    hour: number;
    minute: number;
}

function readMonthDayHourMinute (value: unknown): MonthDayHourMinute | null {
    const match = /^(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(typeof value === "string" ? value.trim() : "");

    if (!match) {
        return null;
    }

    return {
        month: Number(match[1]),
        day: Number(match[2]),
        hour: Number(match[3]),
        minute: Number(match[4]),
    };
}

function readPolygonLabel (value: unknown): MonthDayHourMinute | null {
    const match = /^(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/.exec(typeof value === "string" ? value.trim() : "");

    if (!match) {
        return null;
    }

    return {
        month: Number(match[2]),
        day: Number(match[1]),
        hour: Number(match[3]),
        minute: Number(match[4]),
    };
}

function toUtcTimestamp (year: number, stamp: MonthDayHourMinute): number | null {
    const timestamp = Date.UTC(year, stamp.month - 1, stamp.day, stamp.hour, stamp.minute);
    const date = new Date(timestamp);

    if (
        Number.isNaN(timestamp)
        || date.getUTCFullYear() !== year
        || date.getUTCMonth() !== stamp.month - 1
        || date.getUTCDate() !== stamp.day
        || date.getUTCHours() !== stamp.hour
        || date.getUTCMinutes() !== stamp.minute
    ) {
        return null;
    }

    return timestamp;
}

interface Position {
    lat: number;
    lon: number;
}

function readPosition (feature: Record<string, unknown>): Position | null {
    return readBoundingBoxCentre(feature.bbox) ?? readGeometryCentre(feature.geometry);
}

function readBoundingBoxCentre (bbox: unknown): Position | null {
    if (!Array.isArray(bbox) || bbox.length < 4) {
        return null;
    }

    const [minLon, minLat, maxLon, maxLat] = bbox;

    if (
        typeof minLon !== "number"
        || typeof minLat !== "number"
        || typeof maxLon !== "number"
        || typeof maxLat !== "number"
    ) {
        return null;
    }

    return toPosition((minLat + maxLat) / 2, (minLon + maxLon) / 2);
}

function readGeometryCentre (geometry: unknown): Position | null {
    if (!isRecord(geometry)) {
        return null;
    }

    if (geometry.type === "Point") {
        const coordinates = geometry.coordinates;

        if (!Array.isArray(coordinates) || typeof coordinates[0] !== "number" || typeof coordinates[1] !== "number") {
            return null;
        }

        return toPosition(coordinates[1], coordinates[0]);
    }

    const ring = readFirstRing(geometry.coordinates);

    if (!ring.length) {
        return null;
    }

    const lats = ring.map(([, lat]) => lat);
    const lons = ring.map(([lon]) => lon);

    return toPosition(
        (Math.min(...lats) + Math.max(...lats)) / 2,
        (Math.min(...lons) + Math.max(...lons)) / 2,
    );
}

function readFirstRing (coordinates: unknown): [number, number][] {
    if (!Array.isArray(coordinates)) {
        return [];
    }

    const [first] = coordinates;

    if (!Array.isArray(first)) {
        return [];
    }

    if (typeof first[0] === "number" && typeof first[1] === "number") {
        return coordinates.filter(isCoordinatePair);
    }

    return readFirstRing(coordinates.flat());
}

function isCoordinatePair (value: unknown): value is [number, number] {
    return Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number";
}

function toPosition (lat: number, lon: number): Position | null {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return null;
    }

    return {
        lat: roundCoordinate(lat),
        lon: roundCoordinate(lon),
    };
}

function roundCoordinate (value: number): number {
    return Math.round(value * 1000) / 1000;
}

function isRecord (value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
