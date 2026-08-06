import StormSummary from "../../domain/entities/StormSummary.js";
import StormCone from "../../domain/entities/StormCone.js";
import StormTrack from "../../domain/entities/StormTrack.js";
import StormNotFoundError from "../../domain/errors/StormNotFoundError.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import StormRepository from "../../domain/repositories/IStormRepository.js";
import extractKmlFromKmz from "./extractKmlFromKmz.js";
import parseNhcForecastConeKml from "./parseNhcForecastConeKml.js";
import parseNhcForecastTrackKml, { getStormCategoryFromWindSpeed } from "./parseNhcForecastTrackKml.js";

export { NhcStormRepository as default };

interface NhcActiveStorm {
    id: string;
    name: string;
    intensity: number | null;
    lat: number;
    lon: number;
    lastUpdate: string;
    forecastTrack: {
        issuance: string;
        kmzFile: string;
    };
    trackCone?: {
        issuance: string;
        kmzFile: string;
    };
}

class NhcStormRepository implements StormRepository {
    public constructor (
        private readonly _currentStormsUrl: string,
        private readonly _fetcher: typeof fetch = fetch,
    ) {}

    public async getActiveStorms (): Promise<StormSummary[]> {
        const storms = await this._getCurrentStorms();

        return storms
            .map((storm) => this._toStormSummary(storm))
            .filter((storm): storm is StormSummary => storm !== null);
    }

    public async getStormTrack (stormId: string): Promise<StormTrack> {
        const storm = await this._getActiveStorm(stormId);

        const kmz = await this._fetchBuffer(storm.forecastTrack.kmzFile);
        const kml = extractKmlFromKmz(kmz);

        return {
            stormId,
            name: storm.name,
            source: "nhc",
            issuedAt: storm.forecastTrack.issuance,
            cachedUntil: null,
            observed: [
                {
                    lat: storm.lat,
                    lon: storm.lon,
                    datetime: storm.lastUpdate,
                    windSpeed: storm.intensity,
                    category: getStormCategoryFromWindSpeed(storm.intensity),
                },
            ],
            forecast: parseNhcForecastTrackKml(kml, storm.forecastTrack.issuance),
        };
    }

    public async getStormCone (stormId: string): Promise<StormCone> {
        if (!/^nhc:(AL|EP|CP)\d{6}$/.test(stormId)) {
            return this._notSupportedCone(stormId);
        }

        const storm = await this._getActiveStorm(stormId);

        if (!storm.trackCone) {
            return this._notAvailableCone(stormId);
        }

        const kmz = await this._fetchBuffer(storm.trackCone.kmzFile);
        const kml = extractKmlFromKmz(kmz);

        return {
            stormId,
            source: "nhc",
            issuedAt: storm.trackCone.issuance,
            cachedUntil: null,
            availability: "available",
            geometryKind: "forecast_cone",
            geojson: parseNhcForecastConeKml(kml, storm.trackCone.issuance),
        };
    }

    private async _getActiveStorm (stormId: string): Promise<NhcActiveStorm> {
        const storm = (await this._getCurrentStorms()).find((candidate) => {
            return this._toStormId(candidate.id) === stormId;
        });

        if (!storm) {
            throw new StormNotFoundError(stormId);
        }

        return storm;
    }

    private async _getCurrentStorms (): Promise<NhcActiveStorm[]> {
        const response = await this._fetch(this._currentStormsUrl, "application/json");
        let payload: unknown;

        try {
            payload = await response.json();
        } catch (error) {
            throw new StormProviderError("NHC CurrentStorms response was not valid JSON.", { cause: error });
        }

        if (Array.isArray(payload) && payload.length === 0) {
            return [];
        }

        if (!isRecord(payload) || !Array.isArray(payload.activeStorms)) {
            throw new StormProviderError("NHC CurrentStorms response did not contain activeStorms.");
        }

        return payload.activeStorms.map((storm) => parseNhcActiveStorm(storm));
    }

    private _toStormSummary (storm: NhcActiveStorm): StormSummary | null {
        const basin = getBasin(storm.id);

        if (!basin) {
            return null;
        }

        return {
            stormId: this._toStormId(storm.id),
            name: storm.name,
            source: "nhc",
            basin,
            lat: storm.lat,
            lon: storm.lon,
            datetime: storm.lastUpdate,
            windSpeed: storm.intensity,
            category: getStormCategoryFromWindSpeed(storm.intensity),
        };
    }

    private _toStormId (nhcId: string): string {
        return "nhc:" + nhcId.toUpperCase();
    }

    private async _fetchBuffer (url: string): Promise<Buffer> {
        const response = await this._fetch(url, "application/vnd.google-earth.kmz");

        return Buffer.from(await response.arrayBuffer());
    }

    private _notSupportedCone (stormId: string): StormCone {
        return {
            stormId,
            source: "nhc",
            issuedAt: null,
            cachedUntil: null,
            availability: "not_supported",
            geometryKind: null,
            reason: "NHC forecast cones are supported only for AL, EP, and CP basins.",
            geojson: null,
        };
    }

    private _notAvailableCone (stormId: string): StormCone {
        return {
            stormId,
            source: "nhc",
            issuedAt: null,
            cachedUntil: null,
            availability: "not_available",
            geometryKind: null,
            reason: "NHC has not published a forecast cone for this storm.",
            geojson: null,
        };
    }

    private async _fetch (url: string, accept: string): Promise<Response> {
        try {
            const response = await this._fetcher(url, {
                headers: {
                    Accept: accept,
                    "User-Agent": "soosky-storm-api/1.0",
                },
                signal: AbortSignal.timeout(10_000),
            });

            if (!response.ok) {
                throw new StormProviderError("NHC request failed with HTTP " + response.status + ".");
            }

            return response;
        } catch (error) {
            if (error instanceof StormProviderError) {
                throw error;
            }

            throw new StormProviderError("NHC request could not be completed.", { cause: error });
        }
    }
}

function parseNhcActiveStorm (value: unknown): NhcActiveStorm {
    if (!isRecord(value)) {
        throw new StormProviderError("NHC active storm item was invalid.");
    }

    const id = readRequiredString(value, "id");
    const name = readRequiredString(value, "name");
    const lat = readRequiredNumber(value, "latitudeNumeric");
    const lon = readRequiredNumber(value, "longitudeNumeric");
    const lastUpdate = readRequiredString(value, "lastUpdate");
    const forecastTrack = readRequiredRecord(value, "forecastTrack");

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180 || Number.isNaN(Date.parse(lastUpdate))) {
        throw new StormProviderError("NHC active storm coordinates or time were invalid.");
    }

    return {
        id,
        name,
        intensity: readNullableNumber(value.intensity),
        lat,
        lon,
        lastUpdate,
        forecastTrack: {
            issuance: readRequiredString(forecastTrack, "issuance"),
            kmzFile: readRequiredString(forecastTrack, "kmzFile"),
        },
        trackCone: toTrackCone(readOptionalRecord(value, "trackCone")),
    };
}

function toTrackCone (value: Record<string, unknown> | null): NhcActiveStorm["trackCone"] {
    if (!value) {
        return undefined;
    }

    return {
        issuance: readRequiredString(value, "issuance"),
        kmzFile: readRequiredString(value, "kmzFile"),
    };
}

function getBasin (nhcId: string): string | null {
    switch (nhcId.slice(0, 2).toLowerCase()) {
        case "al":
            return "north_atlantic";
        case "ep":
            return "eastern_north_pacific";
        case "cp":
            return "central_north_pacific";
        default:
            return null;
    }
}

function isRecord (value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredRecord (value: Record<string, unknown>, key: string): Record<string, unknown> {
    if (isRecord(value[key])) {
        return value[key];
    }

    throw new StormProviderError("NHC field [" + key + "] was missing.");
}

function readOptionalRecord (value: Record<string, unknown>, key: string): Record<string, unknown> | null {
    const candidate = value[key];

    if (candidate === undefined || candidate === null) {
        return null;
    }

    if (isRecord(candidate)) {
        return candidate;
    }

    throw new StormProviderError("NHC field [" + key + "] was invalid.");
}

function readRequiredString (value: Record<string, unknown>, key: string): string {
    const candidate = value[key];

    if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
    }

    throw new StormProviderError("NHC field [" + key + "] was missing.");
}

function readRequiredNumber (value: Record<string, unknown>, key: string): number {
    const number = readNullableNumber(value[key]);

    if (number !== null) {
        return number;
    }

    throw new StormProviderError("NHC field [" + key + "] was missing.");
}

function readNullableNumber (value: unknown): number | null {
    const number = typeof value === "number" ? value : Number(value);

    return Number.isFinite(number) ? number : null;
}
