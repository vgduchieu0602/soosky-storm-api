import ForecastWeather, { ForecastUnits, ForecastWeatherCondition, ForecastWeatherPoint } from "../../domain/entities/ForecastWeather.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import ForecastWeatherRepository, { ForecastWeatherQuery } from "../../domain/repositories/IForecastWeatherRepository.js";

const HOURLY_TIMELINE_URL = "https://api.openweathermap.org/data/4.0/onecall/timeline/1h";
const DAILY_TIMELINE_URL = "https://api.openweathermap.org/data/4.0/onecall/timeline/1day";

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
            this._getTimeline(HOURLY_TIMELINE_URL, query, "hourly"),
            this._getTimeline(DAILY_TIMELINE_URL, query, "daily"),
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
    ): Promise<OpenWeatherTimeline> {
        const url = new URL(baseUrl);
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

        return parseTimeline(payload, timelineKind);
    }
}

interface OpenWeatherTimeline {
    timezone: string | null;
    points: ForecastWeatherPoint[];
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

function readWeather (value: unknown): ForecastWeatherCondition[] {
    if (!Array.isArray(value)) {
        throw new StormProviderError("OpenWeather field [weather] was missing.");
    }

    return value.map((condition) => {
        if (!isRecord(condition)) {
            throw new StormProviderError("OpenWeather weather item was invalid.");
        }

        return {
            id: readRequiredNumber(condition, "id"),
            main: readRequiredString(condition, "main"),
            description: readRequiredString(condition, "description"),
            icon: readRequiredString(condition, "icon"),
        };
    });
}

function getUnits (units: ForecastUnits): ForecastWeather["units"] {
    if (units === "standard") {
        return { temperature: "K", windSpeed: "m/s", visibility: "m", rain: "mm/h" };
    }

    if (units === "imperial") {
        return { temperature: "F", windSpeed: "mph", visibility: "m", rain: "mm/h" };
    }

    return { temperature: "C", windSpeed: "m/s", visibility: "m", rain: "mm/h" };
}

function getWindDirection (degrees: number): string {
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const index = Math.round(((degrees % 360) + 360) % 360 / 22.5) % directions.length;

    return directions[index] ?? "N";
}

function readRain1h (value: unknown): number | null {
    if (value === undefined || value === null) {
        return null;
    }

    if (!isRecord(value)) {
        throw new StormProviderError("OpenWeather field [rain] was invalid.");
    }

    return readOptionalNumber(value, "1h");
}

function readRequiredNumber (value: Record<string, unknown>, key: string): number {
    const number = readOptionalNumber(value, key);

    if (number === null) {
        throw new StormProviderError("OpenWeather field [" + key + "] was missing.");
    }

    return number;
}

function readRequiredString (value: Record<string, unknown>, key: string): string {
    const candidate = value[key];

    if (typeof candidate !== "string" || !candidate.trim()) {
        throw new StormProviderError("OpenWeather field [" + key + "] was missing.");
    }

    return candidate;
}

function readOptionalNumber (value: Record<string, unknown>, key: string): number | null {
    const candidate = value[key];

    if (candidate === undefined || candidate === null) {
        return null;
    }

    if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
    }

    throw new StormProviderError("OpenWeather field [" + key + "] was invalid.");
}

function isRecord (value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
