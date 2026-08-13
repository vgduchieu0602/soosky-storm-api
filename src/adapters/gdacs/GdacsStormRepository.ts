import HistoricalStormTrack, { HistoricalStormTrackPoint } from "../../domain/entities/HistoricalStormTrack.js";
import StormSummary from "../../domain/entities/StormSummary.js";
import StormTrack, { StormTrackPoint } from "../../domain/entities/StormTrack.js";
import StormNotFoundError from "../../domain/errors/StormNotFoundError.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import ActiveStormsRepository from "../../domain/repositories/IActiveStormsRepository.js";
import HistoricalStormTrackRepository from "../../domain/repositories/IHistoricalStormTrackRepository.js";
import StormTrackRepository from "../../domain/repositories/IStormTrackRepository.js";
import { getStormCategoryFromWindSpeed } from "../nhc/parseNhcForecastTrackKml.js";
import parseGdacsStormId from "./parseGdacsStormId.js";
import parseGdacsTrackGeometry, { GdacsTrackPoint } from "./parseGdacsTrackGeometry.js";

export { GdacsStormRepository as default };

const KM_PER_HOUR_PER_KNOT = 1.852;
const NO_HISTORY_REASON = "GDACS has not published timed track positions for this storm event.";

interface GdacsEvent {
    eventId: string;
    episodeId: string;
    name: string;
    area: string | null;
    startTimestamp: number;
    currentTimestamp: number;
    issuedAt: string;
    lat: number;
    lon: number;
    windSpeed: number | null;
}

class GdacsStormRepository implements ActiveStormsRepository, StormTrackRepository, HistoricalStormTrackRepository {
    public constructor (
        private readonly _eventListUrl: string,
        private readonly _eventDataUrl: string,
        private readonly _geometryUrl: string,
        private readonly _fetcher: typeof fetch = fetch,
    ) {}

    public async getActiveStorms (): Promise<StormSummary[]> {
        const url = new URL(this._eventListUrl);

        url.searchParams.set("eventlist", "TC");

        const payload = await this._getJson(url.toString(), () => {
            throw new StormProviderError("GDACS event list request failed with HTTP 404.");
        });

        if (!isRecord(payload) || !Array.isArray(payload.features)) {
            throw new StormProviderError("GDACS event list response was not a GeoJSON FeatureCollection.");
        }

        return payload.features
            .filter(isCurrentEventFeature)
            .map((feature) => toStormSummary(feature))
            .filter((summary): summary is StormSummary => summary !== null);
    }

    public async getStormTrack (stormId: string): Promise<StormTrack> {
        const event = await this._getEvent(stormId);
        const points = await this._getTrackPoints(event);
        const observed = points.filter((point) => point.timestamp <= event.currentTimestamp);
        const forecast = points.filter((point) => point.timestamp > event.currentTimestamp);

        return {
            stormId,
            name: event.name,
            source: "gdacs",
            area: event.area,
            issuedAt: event.issuedAt,
            cachedUntil: null,
            observed: observed.length ? observed.map(toObservedPoint) : [toCurrentPoint(event)],
            forecast: forecast.map((point) => toForecastPoint(point, event.currentTimestamp)),
        };
    }

    public async getHistoricalStormTrack (stormId: string): Promise<HistoricalStormTrack> {
        const event = await this._getEvent(stormId);
        const points = await this._getTrackPoints(event);
        const history: HistoricalStormTrackPoint[] = points
            .filter((point) => point.timestamp <= event.currentTimestamp)
            .map(toHistoryPoint);

        if (!history.length) {
            return {
                stormId,
                name: event.name,
                source: "gdacs",
                trackKind: null,
                cachedUntil: null,
                availability: "not_available",
                reason: NO_HISTORY_REASON,
                history: [],
            };
        }

        return {
            stormId,
            name: event.name,
            source: "gdacs",
            trackKind: "gdacs_observed_track",
            cachedUntil: null,
            availability: "available",
            history,
        };
    }

    private async _getEvent (stormId: string): Promise<GdacsEvent> {
        const identifiers = parseGdacsStormId(stormId);

        if (!identifiers) {
            throw new StormNotFoundError(stormId);
        }

        const url = new URL(this._eventDataUrl);

        url.searchParams.set("eventtype", "TC");
        url.searchParams.set("eventid", identifiers.eventId);
        url.searchParams.set("episodeid", identifiers.episodeId);

        const payload = await this._getJson(url.toString(), () => {
            throw new StormNotFoundError(stormId);
        });

        return toGdacsEvent(payload, identifiers.eventId, identifiers.episodeId);
    }

    private async _getTrackPoints (event: GdacsEvent): Promise<GdacsTrackPoint[]> {
        const url = new URL(this._geometryUrl);

        url.searchParams.set("eventtype", "TC");
        url.searchParams.set("eventid", event.eventId);
        url.searchParams.set("episodeid", event.episodeId);

        // A missing geometry document means GDACS published no timed positions yet.
        const payload = await this._getJson(url.toString(), () => null);

        return parseGdacsTrackGeometry(payload, event.startTimestamp);
    }

    private async _getJson (url: string, onNotFound: () => unknown): Promise<unknown> {
        let response: Response;

        try {
            response = await this._fetcher(url, {
                headers: {
                    Accept: "application/geo+json, application/json",
                    "User-Agent": "soosky-storm-api/1.0",
                },
                signal: AbortSignal.timeout(10_000),
            });
        } catch (error) {
            throw new StormProviderError("GDACS request could not be completed.", { cause: error });
        }

        if (response.status === 404) {
            return onNotFound();
        }

        if (!response.ok) {
            throw new StormProviderError("GDACS request failed with HTTP " + response.status + ".");
        }

        try {
            return await response.json();
        } catch (error) {
            throw new StormProviderError("GDACS response was not valid JSON.", { cause: error });
        }
    }
}

function toGdacsEvent (payload: unknown, eventId: string, episodeId: string): GdacsEvent {
    if (!isRecord(payload) || !isRecord(payload.properties)) {
        throw new StormProviderError("GDACS event data response was not a GeoJSON Feature.");
    }

    const properties = payload.properties;
    const startTimestamp = readGdacsTimestamp(properties.fromdate);
    const currentTimestamp = readGdacsTimestamp(properties.todate);
    const position = readPointPosition(payload.geometry);

    if (startTimestamp === null || currentTimestamp === null || !position) {
        throw new StormProviderError("GDACS event data was missing a usable position or time.");
    }

    return {
        eventId,
        episodeId,
        name: readEventName(properties) ?? "TC " + eventId,
        area: readArea(properties.country),
        startTimestamp,
        currentTimestamp,
        issuedAt: new Date(readGdacsTimestamp(properties.datemodified) ?? currentTimestamp).toISOString(),
        lat: position.lat,
        lon: position.lon,
        windSpeed: readWindSpeedInKnots(properties.severitydata),
    };
}

function isCurrentEventFeature (feature: unknown): boolean {
    if (!isRecord(feature) || !isRecord(feature.properties)) {
        return false;
    }

    const isCurrent = feature.properties.iscurrent;

    return isCurrent === true || (typeof isCurrent === "string" && isCurrent.trim().toLowerCase() === "true");
}

function toStormSummary (feature: unknown): StormSummary | null {
    if (!isRecord(feature) || !isRecord(feature.properties)) {
        return null;
    }

    const properties = feature.properties;
    const eventId = readPositiveIntegerText(properties.eventid);
    const episodeId = readPositiveIntegerText(properties.episodeid);
    const position = readPointPosition(feature.geometry);
    const timestamp = readGdacsTimestamp(properties.todate) ?? readGdacsTimestamp(properties.datemodified);

    if (!eventId || !episodeId || !position || timestamp === null) {
        return null;
    }

    const windSpeed = readWindSpeedInKnots(properties.severitydata);

    return {
        stormId: "gdacs:TC:" + eventId + ":" + episodeId,
        name: readEventName(properties) ?? "TC " + eventId,
        source: "gdacs",
        basin: null,
        area: readArea(properties.country),
        lat: position.lat,
        lon: position.lon,
        datetime: new Date(timestamp).toISOString(),
        windSpeed,
        category: getStormCategoryFromWindSpeed(windSpeed),
        alertLevel: readAlertLevel(properties.alertlevel),
    };
}

function readAlertLevel (value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toObservedPoint (point: GdacsTrackPoint): StormTrackPoint {
    return {
        lat: point.lat,
        lon: point.lon,
        datetime: point.datetime,
        windSpeed: null,
        category: getStormCategoryFromWindSpeed(null),
    };
}

function toForecastPoint (point: GdacsTrackPoint, currentTimestamp: number): StormTrackPoint {
    return {
        lat: point.lat,
        lon: point.lon,
        datetime: point.datetime,
        windSpeed: null,
        category: getStormCategoryFromWindSpeed(null),
        forecastHour: Math.round((point.timestamp - currentTimestamp) / 3_600_000),
    };
}

function toHistoryPoint (point: GdacsTrackPoint): HistoricalStormTrackPoint {
    return {
        lat: point.lat,
        lon: point.lon,
        datetime: point.datetime,
        windSpeed: null,
        category: getStormCategoryFromWindSpeed(null),
    };
}

function toCurrentPoint (event: GdacsEvent): StormTrackPoint {
    return {
        lat: event.lat,
        lon: event.lon,
        datetime: new Date(event.currentTimestamp).toISOString(),
        windSpeed: event.windSpeed,
        category: getStormCategoryFromWindSpeed(event.windSpeed),
    };
}

function readEventName (properties: Record<string, unknown>): string | null {
    for (const key of ["eventname", "name"]) {
        const candidate = properties[key];

        if (typeof candidate === "string" && candidate.trim()) {
            return candidate.trim();
        }
    }

    return null;
}

function readArea (value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}


/**
 * GDACS publishes one intensity per event: the maximum sustained wind in km/h.
 * It is converted to knots so the field keeps the same unit as the NHC storms,
 * and any other unit is dropped rather than converted blindly.
 */
function readWindSpeedInKnots (severityData: unknown): number | null {
    if (!isRecord(severityData)) {
        return null;
    }

    const severity = severityData.severity;
    const unit = severityData.severityunit;

    if (typeof severity !== "number" || !Number.isFinite(severity) || severity < 0) {
        return null;
    }

    if (typeof unit !== "string" || unit.trim().toLowerCase() !== "km/h") {
        return null;
    }

    return Math.round(severity / KM_PER_HOUR_PER_KNOT);
}

function readGdacsTimestamp (value: unknown): number | null {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    const text = value.trim();
    // GDACS timestamps are UTC but carry no offset.
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : text + "Z";
    const timestamp = Date.parse(normalized);

    return Number.isNaN(timestamp) ? null : timestamp;
}

function readPositiveIntegerText (value: unknown): string | null {
    const numeric = typeof value === "number" ? value : Number(typeof value === "string" ? value.trim() : NaN);

    if (!Number.isSafeInteger(numeric) || numeric <= 0) {
        return null;
    }

    return String(numeric);
}

interface Position {
    lat: number;
    lon: number;
}

function readPointPosition (geometry: unknown): Position | null {
    if (!isRecord(geometry) || geometry.type !== "Point" || !Array.isArray(geometry.coordinates)) {
        return null;
    }

    const [lon, lat] = geometry.coordinates;

    if (
        typeof lat !== "number"
        || typeof lon !== "number"
        || !Number.isFinite(lat)
        || !Number.isFinite(lon)
        || lat < -90
        || lat > 90
        || lon < -180
        || lon > 180
    ) {
        return null;
    }

    return { lat, lon };
}

function isRecord (value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
