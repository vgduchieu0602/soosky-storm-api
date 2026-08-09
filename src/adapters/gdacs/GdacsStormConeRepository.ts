import StormCone, { GeoJsonFeatureCollection } from "../../domain/entities/StormCone.js";
import StormNotFoundError from "../../domain/errors/StormNotFoundError.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import StormConeRepository from "../../domain/repositories/IStormConeRepository.js";
import parseGdacsStormId from "./parseGdacsStormId.js";

export { GdacsStormConeRepository as default };

class GdacsStormConeRepository implements StormConeRepository {
    public constructor (
        private readonly _geometryUrl: string,
        private readonly _fetcher: typeof fetch = fetch,
    ) {}

    public async getStormCone (stormId: string): Promise<StormCone> {
        const identifiers = parseGdacsStormId(stormId);

        if (!identifiers) {
            throw new StormNotFoundError(stormId);
        }

        const response = await this._fetch(
            buildGeometryUrl(this._geometryUrl, identifiers.eventId, identifiers.episodeId),
            stormId,
        );
        let payload: unknown;

        try {
            payload = await response.json();
        } catch (error) {
            throw new StormProviderError("GDACS geometry response was not valid JSON.", { cause: error });
        }

        if (!isFeatureCollection(payload)) {
            throw new StormProviderError("GDACS geometry response was not a GeoJSON FeatureCollection.");
        }

        if (payload.features.length === 0) {
            return this._notAvailableCone(stormId);
        }

        return {
            stormId,
            source: "gdacs",
            issuedAt: null,
            cachedUntil: null,
            availability: "available",
            geometryKind: "gdacs_event_area",
            geojson: payload,
        };
    }

    private _notAvailableCone (stormId: string): StormCone {
        return {
            stormId,
            source: "gdacs",
            issuedAt: null,
            cachedUntil: null,
            availability: "not_available",
            geometryKind: null,
            reason: "GDACS has not published geometry for this storm event.",
            geojson: null,
        };
    }

    private async _fetch (url: string, stormId: string): Promise<Response> {
        try {
            const response = await this._fetcher(url, {
                headers: {
                    Accept: "application/geo+json, application/json",
                    "User-Agent": "soosky-storm-api/1.0",
                },
                signal: AbortSignal.timeout(10_000),
            });

            if (response.status === 404) {
                throw new StormNotFoundError(stormId);
            }

            if (!response.ok) {
                throw new StormProviderError("GDACS request failed with HTTP " + response.status + ".");
            }

            return response;
        } catch (error) {
            if (error instanceof StormProviderError || error instanceof StormNotFoundError) {
                throw error;
            }

            throw new StormProviderError("GDACS request could not be completed.", { cause: error });
        }
    }
}

function buildGeometryUrl (geometryUrl: string, eventId: string, episodeId: string): string {
    const url = new URL(geometryUrl);

    url.searchParams.set("eventtype", "TC");
    url.searchParams.set("eventid", eventId);
    url.searchParams.set("episodeid", episodeId);

    return url.toString();
}

function isFeatureCollection (value: unknown): value is GeoJsonFeatureCollection {
    if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
        return false;
    }

    return value.features.every(isGeoJsonFeature);
}

function isGeoJsonFeature (value: unknown): boolean {
    if (!isRecord(value) || value.type !== "Feature" || !isRecord(value.properties) || !isRecord(value.geometry)) {
        return false;
    }

    return typeof value.geometry.type === "string" && "coordinates" in value.geometry;
}

function isRecord (value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
