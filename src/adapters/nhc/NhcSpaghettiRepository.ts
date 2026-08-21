import { gunzipSync } from "node:zlib";
import StormSpaghetti from "../../domain/entities/storm/StormSpaghetti.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import SpaghettiRepository from "../../domain/repositories/storm/ISpaghettiRepository.js";
import parseNhcAidDeck from "./parseNhcAidDeck.js";

export { NhcSpaghettiRepository as default };

const FILE_PREFIXES: Readonly<Record<string, string>> = {
    AL: "aal",
    EP: "aep",
    CP: "acp",
};

const NOT_SUPPORTED_REASON = "NHC ATCF spaghetti data is supported only for AL, EP, and CP basins.";
const NOT_AVAILABLE_REASON = "NHC has not published usable model forecast data for this storm.";

class NhcSpaghettiRepository implements SpaghettiRepository {
    public constructor (
        private readonly _aidPublicUrl: string,
        private readonly _fetcher: typeof fetch = fetch,
    ) {}

    public async getStormSpaghetti (stormId: string): Promise<StormSpaghetti> {
        const fileName = this._getFileName(stormId);

        if (!fileName) {
            return this._notSupported(stormId);
        }

        const response = await this._fetchAidDeck(fileName);

        if (!response) {
            return this._notAvailable(stormId);
        }

        const content = await this._readAidDeck(response);
        const parsed = parseNhcAidDeck(content);

        if (!parsed) {
            return this._notAvailable(stormId);
        }

        return {
            stormId,
            source: "nhc-atcf",
            cycleTime: parsed.cycleTime,
            cachedUntil: null,
            availability: "available",
            models: parsed.models,
        };
    }

    private _getFileName (stormId: string): string | null {
        const match = /^nhc:(AL|EP|CP)(\d{2})(\d{4})$/.exec(stormId);
        const basin = match?.[1];
        const stormNumber = match?.[2];
        const year = match?.[3];

        if (!basin || !stormNumber || !year) {
            return null;
        }

        return FILE_PREFIXES[basin] + stormNumber + year + ".dat.gz";
    }

    private async _fetchAidDeck (fileName: string): Promise<Response | null> {
        const url = this._aidPublicUrl.replace(/\/+$/, "") + "/" + fileName;
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
            throw new StormProviderError("NHC ATCF request could not be completed.", { cause: error });
        }

        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            throw new StormProviderError("NHC ATCF request failed with HTTP " + response.status + ".");
        }

        return response;
    }

    private async _readAidDeck (response: Response): Promise<string> {
        try {
            const compressed = Buffer.from(await response.arrayBuffer());

            return gunzipSync(compressed).toString("utf-8");
        } catch (error) {
            throw new StormProviderError("NHC ATCF response was not a valid gzip file.", { cause: error });
        }
    }

    private _notSupported (stormId: string): StormSpaghetti {
        return {
            stormId,
            source: "nhc-atcf",
            cycleTime: null,
            cachedUntil: null,
            availability: "not_supported",
            reason: NOT_SUPPORTED_REASON,
            models: [],
        };
    }

    private _notAvailable (stormId: string): StormSpaghetti {
        return {
            stormId,
            source: "nhc-atcf",
            cycleTime: null,
            cachedUntil: null,
            availability: "not_available",
            reason: NOT_AVAILABLE_REASON,
            models: [],
        };
    }
}
