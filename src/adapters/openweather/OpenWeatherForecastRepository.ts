import ForecastWeather, { ForecastWeatherPoint } from "../../domain/entities/ForecastWeather.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import ForecastWeatherRepository, { ForecastWeatherQuery } from "../../domain/repositories/IForecastWeatherRepository.js";
import {
    getUnits,
    getWindDirection,
    isRecord,
    readOptionalNumber,
    readRain1h,
    readRequiredNumber,
    readWeather,
} from "./openWeatherFields.js";

const HOURLY_TIMELINE_URL = "https://api.openweathermap.org/data/4.0/onecall/timeline/1h";
const DAILY_TIMELINE_URL = "https://api.openweathermap.org/data/4.0/onecall/timeline/1day";
const OPENWEATHER_HOST = "api.openweathermap.org";

/**
 * One Call 4.0 caps a timeline page at 20 hourly points and ignores a larger `cnt`,
 * so extra hourly pages are followed to reach a usable mobile timeline. Ten daily
 * points already cover the published daily range, so daily stays on one page.
 */
const MAX_HOURLY_PAGES = 3;
const MAX_DAILY_PAGES = 1;

export { OpenWeatherForecastRepository as default };

class OpenWeatherForecastRepository implements ForecastWeatherRepository {
    public constructor (
        private readonly _apiKey: string | undefined,
        private readonly _fetcher: typeof fetch = fetch,
    ) {}

    public async getForecast (query: ForecastWeatherQuery): Promise<ForecastWeather> {
        if (!this._apiKey?.trim()) {
            throw new StormProviderError("OPENWEATHER_API_KEY is required.");
        }

        const [hourly, daily] = await Promise.all([
            this._getTimeline(HOURLY_TIMELINE_URL, query, "hourly", MAX_HOURLY_PAGES),
            this._getTimeline(DAILY_TIMELINE_URL, query, "daily", MAX_DAILY_PAGES),
        ]);

        return {
            location: {
                lat: query.lat,
                lon: query.lon,
                timezone: hourly.timezone ?? daily.timezone,
            },
            units: getUnits(query.units),
            cachedUntil: null,
            hourly: hourly.points,
            daily: daily.points,
        };
    }

    private async _getTimeline (
        baseUrl: string,
        query: ForecastWeatherQuery,
        timelineKind: "hourly" | "daily",
        maxPages: number,
    ): Promise<OpenWeatherTimeline> {
        const pointsByTime = new Map<string, ForecastWeatherPoint>();
        const requestedUrls = new Set<string>();
        let timezone: string | null = null;
        let nextUrl: string | null = buildFirstPageUrl(baseUrl, query, this._apiKey ?? "");

        for (let page = 0; page < maxPages && nextUrl; page += 1) {
            if (requestedUrls.has(nextUrl)) {
                break;
            }

            requestedUrls.add(nextUrl);

            const payload = await this._getPage(nextUrl);
            const parsed = parseTimeline(payload, timelineKind);

            timezone = timezone ?? parsed.timezone;

            for (const point of parsed.points) {
                if (!pointsByTime.has(point.time)) {
                    pointsByTime.set(point.time, point);
                }
            }

            nextUrl = readNextPageUrl(payload);
        }

        return {
            timezone,
            points: [...pointsByTime.values()].sort((left, right) => Date.parse(left.time) - Date.parse(right.time)),
        };
    }

    private async _getPage (url: string): Promise<unknown> {
        let response: Response;

        try {
            response = await this._fetcher(url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "soosky-storm-api/1.0",
                },
                signal: AbortSignal.timeout(10_000),
            });
        } catch (error) {
            throw new StormProviderError("OpenWeather request could not be completed.", { cause: error });
        }

        if (!response.ok) {
            throw new StormProviderError("OpenWeather request failed with HTTP " + response.status + ".");
        }

        try {
            return await response.json();
        } catch (error) {
            throw new StormProviderError("OpenWeather response was not valid JSON.", { cause: error });
        }
    }
}

interface OpenWeatherTimeline {
    timezone: string | null;
    points: ForecastWeatherPoint[];
}

function buildFirstPageUrl (baseUrl: string, query: ForecastWeatherQuery, apiKey: string): string {
    const url = new URL(baseUrl);

    url.searchParams.set("lat", String(query.lat));
    url.searchParams.set("lon", String(query.lon));
    url.searchParams.set("units", query.units);
    url.searchParams.set("appid", apiKey);

    return url.toString();
}

/**
 * OpenWeather returns `next` as a plain-HTTP URL carrying the API key, so the link is
 * only used after the host is confirmed and the scheme is forced back to HTTPS.
 */
function readNextPageUrl (payload: unknown): string | null {
    if (!isRecord(payload) || typeof payload.next !== "string" || !payload.next.trim()) {
        return null;
    }

    let url: URL;

    try {
        url = new URL(payload.next);
    } catch {
        return null;
    }

    if (url.hostname !== OPENWEATHER_HOST) {
        return null;
    }

    url.protocol = "https:";

    return url.toString();
}

function parseTimeline (value: unknown, timelineKind: "hourly" | "daily"): OpenWeatherTimeline {
    if (!isRecord(value) || !Array.isArray(value.data)) {
        throw new StormProviderError("OpenWeather response did not contain data.");
    }

    return {
        timezone: typeof value.timezone === "string" && value.timezone.trim() ? value.timezone : null,
        points: value.data.map((point) => parsePoint(point, timelineKind)),
    };
}

function parsePoint (value: unknown, timelineKind: "hourly" | "daily"): ForecastWeatherPoint {
    if (!isRecord(value)) {
        throw new StormProviderError("OpenWeather forecast item was invalid.");
    }

    const timestamp = readRequiredNumber(value, "dt");
    const time = new Date(timestamp * 1000);

    if (Number.isNaN(time.getTime())) {
        throw new StormProviderError("OpenWeather field [dt] was invalid.");
    }

    const windDeg = readOptionalNumber(value, "wind_deg");
    const pop = readOptionalNumber(value, "pop");

    if (pop !== null && (pop < 0 || pop > 1)) {
        throw new StormProviderError("OpenWeather field [pop] was invalid.");
    }

    return {
        time: time.toISOString(),
        temp: timelineKind === "daily" ? readDailyTemp(value.temp) : readOptionalNumber(value, "temp"),
        humidity: readOptionalNumber(value, "humidity"),
        uvi: readOptionalNumber(value, "uvi"),
        visibility: readOptionalNumber(value, "visibility"),
        windSpeed: readOptionalNumber(value, "wind_speed"),
        windDeg,
        windDirection: windDeg === null ? null : getWindDirection(windDeg),
        pop,
        rain1hMm: timelineKind === "hourly" ? readRain1h(value.rain) : null,
        weather: readWeather(value.weather),
    };
}

function readDailyTemp (value: unknown): number | null {
    if (value === undefined || value === null) {
        return null;
    }

    if (!isRecord(value)) {
        throw new StormProviderError("OpenWeather field [temp] was invalid.");
    }

    return readOptionalNumber(value, "day");
}
