import Radar, { RadarFrame } from "../../domain/entities/Radar.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import RadarRepository from "../../domain/repositories/IRadarRepository.js";

const RAINVIEWER_MANIFEST_URL = "https://api.rainviewer.com/public/weather-maps.json";

export { RainViewerRadarRepository as default };

class RainViewerRadarRepository implements RadarRepository {
    public constructor (
        private readonly _fetcher: typeof fetch = fetch,
    ) {}

    public async getRadar (): Promise<Radar> {
        let response: Response;

        try {
            response = await this._fetcher(RAINVIEWER_MANIFEST_URL, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "soosky-storm-api/1.0",
                },
                signal: AbortSignal.timeout(10_000),
            });
        } catch (error) {
            throw new StormProviderError("RainViewer request could not be completed.", { cause: error });
        }

        if (!response.ok) {
            throw new StormProviderError("RainViewer request failed with HTTP " + response.status + ".");
        }

        let payload: unknown;

        try {
            payload = await response.json();
        } catch (error) {
            throw new StormProviderError("RainViewer response was not valid JSON.", { cause: error });
        }

        return parseRadar(payload);
    }
}

function parseRadar (value: unknown): Radar {
    if (!isRecord(value)) {
        throw new StormProviderError("RainViewer manifest was invalid.");
    }

    const host = readHost(value.host);

    return {
        source: "rainviewer",
        attribution: "Weather data by RainViewer",
        attributionUrl: "https://www.rainviewer.com/",
        host,
        tileTemplate: host + "{path}/256/{z}/{x}/{y}/2/1_1.png",
        past: readFrames(value.radar, "past", true),
        nowcast: readFrames(value.radar, "nowcast", false),
        generatedAt: toIsoTime(readRequiredNumber(value, "generated"), "generated"),
        cachedUntil: null,
    };
}

function readFrames (radar: unknown, key: string, required: boolean): RadarFrame[] {
    if (!isRecord(radar)) {
        throw new StormProviderError("RainViewer field [radar." + key + "] was invalid.");
    }

    if (radar[key] === undefined && !required) {
        return [];
    }

    if (!Array.isArray(radar[key])) {
        throw new StormProviderError("RainViewer field [radar." + key + "] was invalid.");
    }

    return radar[key].map((frame) => {
        if (!isRecord(frame)) {
            throw new StormProviderError("RainViewer radar frame was invalid.");
        }

        const path = frame.path;

        if (typeof path !== "string" || !path.startsWith("/")) {
            throw new StormProviderError("RainViewer radar frame path was invalid.");
        }

        return {
            time: toIsoTime(readRequiredNumber(frame, "time"), "radar frame time"),
            path,
        };
    });
}

function readHost (value: unknown): string {
    if (typeof value !== "string") {
        throw new StormProviderError("RainViewer field [host] was missing.");
    }

    let url: URL;

    try {
        url = new URL(value);
    } catch (error) {
        throw new StormProviderError("RainViewer field [host] was invalid.", { cause: error });
    }

    if (url.protocol !== "https:" || !url.hostname) {
        throw new StormProviderError("RainViewer field [host] was invalid.");
    }

    return url.origin;
}

function readRequiredNumber (value: Record<string, unknown>, key: string): number {
    const candidate = value[key];

    if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
        throw new StormProviderError("RainViewer field [" + key + "] was invalid.");
    }

    return candidate;
}

function toIsoTime (unixSeconds: number, field: string): string {
    const date = new Date(unixSeconds * 1000);

    if (Number.isNaN(date.getTime())) {
        throw new StormProviderError("RainViewer field [" + field + "] was invalid.");
    }

    return date.toISOString();
}

function isRecord (value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
