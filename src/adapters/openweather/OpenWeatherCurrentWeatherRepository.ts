import CurrentWeather from "../../domain/entities/CurrentWeather.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import CurrentWeatherRepository, { CurrentWeatherQuery } from "../../domain/repositories/ICurrentWeatherRepository.js";
import {
    getUnits,
    getWindDirection,
    isRecord,
    readOptionalNumber,
    readRain1h,
    readRequiredNumber,
    readTimezone,
    readWeather,
} from "./openWeatherFields.js";

export { OpenWeatherCurrentWeatherRepository as default };

const CURRENT_URL = "https://api.openweathermap.org/data/2.5/weather";

class OpenWeatherCurrentWeatherRepository implements CurrentWeatherRepository {
    public constructor (
        private readonly _apiKey: string | undefined,
        private readonly _fetcher: typeof fetch = fetch,
    ) {}

    public async getCurrentWeather (query: CurrentWeatherQuery): Promise<CurrentWeather> {
        if (!this._apiKey?.trim()) {
            throw new StormProviderError("OPENWEATHER_API_KEY is required.");
        }

        const payload = await this._getObservation(query);
        const main = readMain(payload);
        const wind = readRecord(payload.wind);
        const windDeg = wind === null ? null : readOptionalNumber(wind, "deg");
        const weather = readWeather(payload.weather);

        return {
            location: {
                lat: query.lat,
                lon: query.lon,
                timezone: readTimezone(payload.timezone),
            },
            units: getUnits(query.units),
            observedAt: readObservedAt(payload),
            cachedUntil: null,
            temperature: readOptionalNumber(main, "temp"),
            humidity: readOptionalNumber(main, "humidity"),
            // Current Weather Data 2.5 publishes neither a UV index nor a precipitation
            // probability; both stay null rather than being invented from the forecast.
            uvi: null,
            visibility: readOptionalNumber(payload, "visibility"),
            windSpeed: wind === null ? null : readOptionalNumber(wind, "speed"),
            windDeg,
            windDirection: windDeg === null ? null : getWindDirection(windDeg),
            rain1h: readRain1h(payload.rain),
            precipitationProbability: null,
            weatherDescription: weather[0]?.description ?? null,
            weather,
        };
    }

    private async _getObservation (query: CurrentWeatherQuery): Promise<Record<string, unknown>> {
        const url = new URL(CURRENT_URL);

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
            throw new StormProviderError("OpenWeather observation was invalid.");
        }

        return payload;
    }
}

function readMain (payload: Record<string, unknown>): Record<string, unknown> {
    if (!isRecord(payload.main)) {
        throw new StormProviderError("OpenWeather field [main] was missing.");
    }

    return payload.main;
}

function readRecord (value: unknown): Record<string, unknown> | null {
    if (value === undefined || value === null) {
        return null;
    }

    if (!isRecord(value)) {
        throw new StormProviderError("OpenWeather field [wind] was invalid.");
    }

    return value;
}

function readObservedAt (payload: Record<string, unknown>): string {
    const observedAt = new Date(readRequiredNumber(payload, "dt") * 1000);

    if (Number.isNaN(observedAt.getTime())) {
        throw new StormProviderError("OpenWeather field [dt] was invalid.");
    }

    return observedAt.toISOString();
}
