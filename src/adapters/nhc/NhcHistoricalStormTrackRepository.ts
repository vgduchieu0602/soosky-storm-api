import { gunzipSync } from "node:zlib";
import HistoricalStormTrack from "../../domain/entities/HistoricalStormTrack.js";
import StormNotFoundError from "../../domain/errors/StormNotFoundError.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import HistoricalStormTrackRepository from "../../domain/repositories/IHistoricalStormTrackRepository.js";
import extractKmlFromKmz from "./extractKmlFromKmz.js";
import parseNhcBestTrackDeck from "./parseNhcBestTrackDeck.js";
import parseNhcBestTrackKml from "./parseNhcBestTrackKml.js";

export { NhcHistoricalStormTrackRepository as default };

const NOT_AVAILABLE_REASON = "NHC has not published a best track for this storm.";

interface NhcHistoricalActiveStorm {
    id: string;
    name: string;
    bestTrackUrl: string | null;
}

interface NhcArchiveAsset {
    stormCode: string;
    url: string;
}

class NhcHistoricalStormTrackRepository implements HistoricalStormTrackRepository {
    public constructor (
        private readonly _currentStormsUrl: string,
        private readonly _fetcher: typeof fetch = fetch,
        private readonly _archiveUrl: string | null = null,
    ) {}

    public async getHistoricalStormTrack (stormId: string): Promise<HistoricalStormTrack> {
        const storm = await this._findActiveStorm(stormId);

        if (!storm) {
            return this._getArchivedStormTrack(stormId);
        }

        if (!storm.bestTrackUrl) {
            return {
                stormId,
                name: storm.name,
                source: "nhc",
                trackKind: null,
                cachedUntil: null,
                availability: "not_available",
                reason: NOT_AVAILABLE_REASON,
                history: [],
            };
        }

        const data = await this._fetchBuffer(storm.bestTrackUrl);
        const kml = isKmlAsset(storm.bestTrackUrl)
            ? data.toString("utf-8")
            : extractKmlFromKmz(data);

        return {
            stormId,
            name: storm.name,
            source: "nhc",
            trackKind: "best_track",
            cachedUntil: null,
            availability: "available",
            history: parseNhcBestTrackKml(kml),
        };
    }

    private async _getArchivedStormTrack (stormId: string): Promise<HistoricalStormTrack> {
        const asset = this._getArchiveAsset(stormId);

        if (!asset) {
            throw new StormNotFoundError(stormId);
        }

        const response = await this._fetchArchive(asset.url);

        if (!response) {
            return this._notAvailableArchive(stormId, asset.stormCode);
        }

        const history = parseNhcBestTrackDeck(await this._readArchive(response));

        if (!history.length) {
            return this._notAvailableArchive(stormId, asset.stormCode);
        }

        return {
            stormId,
            name: asset.stormCode,
            source: "nhc",
            trackKind: "best_track",
            cachedUntil: null,
            availability: "available",
            history,
        };
    }

    private _getArchiveAsset (stormId: string): NhcArchiveAsset | null {
        const match = /^nhc:(AL|EP|CP)(\d{2})(\d{4})$/.exec(stormId);
        const basin = match?.[1];
        const stormNumber = match?.[2];
        const year = match?.[3];

        if (!this._archiveUrl || !basin || !stormNumber || !year) {
            return null;
        }

        const fileName = "b" + basin.toLowerCase() + stormNumber + year + ".dat.gz";

        return {
            stormCode: basin + stormNumber + year,
            url: this._archiveUrl.replace(/\/+$/, "") + "/" + year + "/" + fileName,
        };
    }

    private _notAvailableArchive (stormId: string, stormCode: string): HistoricalStormTrack {
        return {
            stormId,
            name: stormCode,
            source: "nhc",
            trackKind: null,
            cachedUntil: null,
            availability: "not_available",
            reason: NOT_AVAILABLE_REASON,
            history: [],
        };
    }

    private async _findActiveStorm (stormId: string): Promise<NhcHistoricalActiveStorm | null> {
        const storm = (await this._getCurrentStorms()).find((candidate) => "nhc:" + candidate.id.toUpperCase() === stormId);

        return storm ?? null;
    }

    private async _getCurrentStorms (): Promise<NhcHistoricalActiveStorm[]> {
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

        return payload.activeStorms.map(parseNhcHistoricalActiveStorm);
    }

    private async _fetchBuffer (url: string): Promise<Buffer> {
        const response = await this._fetch(url, "application/vnd.google-earth.kmz, application/vnd.google-earth.kml+xml");

        try {
            return Buffer.from(await response.arrayBuffer());
        } catch (error) {
            throw new StormProviderError("NHC best-track asset could not be read.", { cause: error });
        }
    }

    private async _fetchArchive (url: string): Promise<Response | null> {
        let response: Response;

        try {
            response = await this._fetcher(url, {
                headers: {
                    Accept: "application/gzip",
                    "User-Agent": "soosky-storm-api/1.0",
                },
                signal: AbortSignal.timeout(10_000),
            });
        } catch (error) {
            throw new StormProviderError("NHC archive request could not be completed.", { cause: error });
        }

        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            throw new StormProviderError("NHC archive request failed with HTTP " + response.status + ".");
        }

        return response;
    }

    private async _readArchive (response: Response): Promise<string> {
        try {
            const compressed = Buffer.from(await response.arrayBuffer());

            return gunzipSync(compressed).toString("utf-8");
        } catch (error) {
            throw new StormProviderError("NHC archive response was not a valid gzip file.", { cause: error });
        }
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

function parseNhcHistoricalActiveStorm (value: unknown): NhcHistoricalActiveStorm {
    if (!isRecord(value)) {
        throw new StormProviderError("NHC active storm item was invalid.");
    }

    return {
        id: readRequiredString(value, "id"),
        name: readRequiredString(value, "name"),
        bestTrackUrl: readBestTrackUrl(value.bestTrackGIS),
    };
}

function readBestTrackUrl (value: unknown): string | null {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === "string" && value.trim()) {
        return value;
    }

    if (!isRecord(value)) {
        throw new StormProviderError("NHC bestTrackGIS field was invalid.");
    }

    for (const key of ["kmzFile", "kmlFile", "url"]) {
        const candidate = value[key];

        if (typeof candidate === "string" && candidate.trim()) {
            return candidate;
        }
    }

    throw new StormProviderError("NHC bestTrackGIS field was invalid.");
}

function readRequiredString (value: Record<string, unknown>, key: string): string {
    const candidate = value[key];

    if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
    }

    throw new StormProviderError("NHC field [" + key + "] was missing.");
}

function isKmlAsset (url: string): boolean {
    return /\.kml(?:[?#]|$)/i.test(url);
}

function isRecord (value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
