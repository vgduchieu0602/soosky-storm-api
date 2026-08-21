import ForecastWeather, { ForecastWeatherPoint } from "../../domain/entities/weather/ForecastWeather.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import ForecastWeatherRepository, { ForecastWeatherQuery } from "../../domain/repositories/weather/IForecastWeatherRepository.js";
import {
    getUnits,
    getWindDirection,
    isRecord,
    readOptionalNumber,
    readRainAccumulation,
    readRequiredNumber,
    readTimezone,
    readWeather,
} from "./openWeatherFields.js";

const FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast";
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** The 5 day / 3 hour endpoint publishes one point every three hours. */
const STEP_HOURS = 3;
const STEP_MS = STEP_HOURS * HOUR_MS;
const MAX_DAILY_POINTS = 5;

export { OpenWeatherForecastRepository as default };

interface ParsedForecastPoint {
    point: ForecastWeatherPoint;
    timestamp: number;
    /** Rain accumulated over the three-hour slot, in millimetres. */
    rainMm: number | null;
}

class OpenWeatherForecastRepository implements ForecastWeatherRepository {
    public constructor (
        private readonly _apiKey: string | undefined,
        private readonly _fetcher: typeof fetch = fetch,
        private readonly _now: () => number = Date.now,
    ) {}

    public async getForecast (query: ForecastWeatherQuery): Promise<ForecastWeather> {
        if (!this._apiKey?.trim()) {
            throw new StormProviderError("OPENWEATHER_API_KEY is required.");
        }

        const payload = await this._getForecast(query);
        const parsed = readList(payload).map(parsePoint).sort((left, right) => left.timestamp - right.timestamp);
        const offsetMs = (readCityOffsetSeconds(payload) ?? 0) * 1000;
        const now = this._now();
        const endOfHourlyWindow = now + DAY_MS;

        return {
            location: {
                lat: query.lat,
                lon: query.lon,
                timezone: readTimezone(readCityOffsetSeconds(payload)),
            },
            units: getUnits(query.units),
            cachedUntil: null,
            // Hourly covers the next 24 hours from the caller's current time. Keep
            // the slot in progress so the window has no gap at its beginning.
            hourly: parsed
                .filter((entry) => {
                    return entry.timestamp < endOfHourlyWindow
                        && entry.timestamp + STEP_MS > now;
                })
                .map(({ point }) => point),
            daily: toDailyPoints(parsed, offsetMs),
        };
    }

    private async _getForecast (query: ForecastWeatherQuery): Promise<Record<string, unknown>> {
        const url = new URL(FORECAST_URL);

        url.searchParams.set("lat", String(query.lat));
        url.searchParams.set("lon", String(query.lon));
        url.searchParams.set("units", query.units);
        url.searchParams.set("appid", this._apiKey ?? "");

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

        let payload: unknown;

        try {
            payload = await response.json();
        } catch (error) {
            throw new StormProviderError("OpenWeather response was not valid JSON.", { cause: error });
        }

        if (!isRecord(payload)) {
            throw new StormProviderError("OpenWeather response did not contain data.");
        }

        return payload;
    }
}

function readList (payload: Record<string, unknown>): unknown[] {
    if (!Array.isArray(payload.list)) {
        throw new StormProviderError("OpenWeather response did not contain data.");
    }

    return payload.list;
}

function readCityOffsetSeconds (payload: Record<string, unknown>): number | null {
    return isRecord(payload.city) ? readOptionalNumber(payload.city, "timezone") : null;
}

function parsePoint (value: unknown): ParsedForecastPoint {
    if (!isRecord(value)) {
        throw new StormProviderError("OpenWeather forecast item was invalid.");
    }

    const timestamp = readRequiredNumber(value, "dt") * 1000;

    if (!Number.isFinite(timestamp)) {
        throw new StormProviderError("OpenWeather field [dt] was invalid.");
    }

    const main = isRecord(value.main) ? value.main : null;
    const wind = isRecord(value.wind) ? value.wind : null;
    const windDeg = wind === null ? null : readOptionalNumber(wind, "deg");
    const pop = readOptionalNumber(value, "pop");

    if (pop !== null && (pop < 0 || pop > 1)) {
        throw new StormProviderError("OpenWeather field [pop] was invalid.");
    }

    const rainMm = readRainAccumulation(value.rain, "3h");

    return {
        timestamp,
        rainMm,
        point: {
            time: new Date(timestamp).toISOString(),
            temp: main === null ? null : readOptionalNumber(main, "temp"),
            humidity: main === null ? null : readOptionalNumber(main, "humidity"),
            // 5 day / 3 hour carries no UV index.
            uvi: null,
            visibility: readOptionalNumber(value, "visibility"),
            windSpeed: wind === null ? null : readOptionalNumber(wind, "speed"),
            windDeg,
            windDirection: windDeg === null ? null : getWindDirection(windDeg),
            pop,
            // The provider accumulates rain over the slot; the entity carries a rate.
            rain1hMm: rainMm === null ? null : round(rainMm / STEP_HOURS),
            weather: readWeather(value.weather),
        },
    };
}

/**
 * The endpoint has no daily array, so days are folded out of the three-hour points:
 * the point nearest local noon describes the day, while wind and probability take the
 * worst value of the day and rain is the day's total.
 */
function toDailyPoints (parsed: ParsedForecastPoint[], offsetMs: number): ForecastWeatherPoint[] {
    const days = new Map<number, ParsedForecastPoint[]>();

    for (const entry of parsed) {
        const localDay = toLocalDay(entry.timestamp, offsetMs);
        const bucket = days.get(localDay);

        if (bucket) {
            bucket.push(entry);
            continue;
        }

        days.set(localDay, [entry]);
    }

    return [...days.entries()]
        .sort(([left], [right]) => left - right)
        .slice(0, MAX_DAILY_POINTS)
        .map(([localDay, entries]) => toDailyPoint(localDay, entries, offsetMs));
}

function toDailyPoint (
    localDay: number,
    entries: ParsedForecastPoint[],
    offsetMs: number,
): ForecastWeatherPoint {
    const localNoon = (localDay * DAY_MS) + (12 * HOUR_MS);
    const representative = entries.reduce((closest, entry) => {
        const entryDistance = Math.abs((entry.timestamp + offsetMs) - localNoon);
        const closestDistance = Math.abs((closest.timestamp + offsetMs) - localNoon);

        return entryDistance < closestDistance ? entry : closest;
    });
    const rainTotalMm = entries.reduce<number | null>((total, entry) => {
        return entry.rainMm === null ? total : (total ?? 0) + entry.rainMm;
    }, null);

    return {
        ...representative.point,
        time: new Date(localNoon - offsetMs).toISOString(),
        pop: pickMax(entries.map(({ point }) => point.pop)),
        windSpeed: pickMax(entries.map(({ point }) => point.windSpeed)),
        rain1hMm: rainTotalMm === null ? null : round(rainTotalMm),
    };
}

function toLocalDay (timestamp: number, offsetMs: number): number {
    return Math.floor((timestamp + offsetMs) / DAY_MS);
}

function pickMax (values: (number | null)[]): number | null {
    const numbers = values.filter((value): value is number => value !== null);

    return numbers.length ? Math.max(...numbers) : null;
}

function round (value: number): number {
    return Math.round(value * 100) / 100;
}
