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
    readWeather,
} from "./openWeatherFields.js";

export { OpenWeatherCurrentWeatherRepository as default };

const CURRENT_URL = "https://api.openweathermap.org/data/4.0/onecall/current";
const HOURLY_TIMELINE_URL = "https://api.openweathermap.org/data/4.0/onecall/timeline/1h";

interface OpenWeatherObservation {
    timezone: string | null;
    point: Record<string, unknown>;
}

class OpenWeatherCurrentWeatherRepository implements CurrentWeatherRepository {
    public constructor (
        private readonly _apiKey: string | undefined,
        private readonly _fetcher: typeof fetch = fetch,
    ) {}

    public async getCurrentWeather (query: CurrentWeatherQuery): Promise<CurrentWeather> {
        if (!this._apiKey?.trim()) {
            throw new StormProviderError("OPENWEATHER_API_KEY is required.");
        }

        // One Call 4.0 publishes the observation without `pop`, so the probability for
        // the current hour is read from the hourly timeline instead of being invented.
        const [observation, precipitationProbability] = await Promise.all([
            this._getObservation(CURRENT_URL, query),
            this._getCurrentHourProbability(query),
        ]);
        const point = observation.point;
        const windDeg = readOptionalNumber(point, "wind_deg");
        const weather = readWeather(point.weather);

        return {
            location: {
                lat: query.lat,
                lon: query.lon,
                timezone: observation.timezone,
            },
            units: getUnits(query.units),
            observedAt: readObservedAt(point),
            cachedUntil: null,
            temperature: readOptionalNumber(point, "temp"),
            humidity: readOptionalNumber(point, "humidity"),
            uvi: readOptionalNumber(point, "uvi"),
            visibility: readOptionalNumber(point, "visibility"),
            windSpeed: readOptionalNumber(point, "wind_speed"),
            windDeg,
            windDirection: windDeg === null ? null : getWindDirection(windDeg),
            rain1h: readRain1h(point.rain),
            precipitationProbability,
            weatherDescription: weather[0]?.description ?? null,
            weather,
        };
    }

    /**
     * Returns null instead of failing the request: the observation itself is the
     * payload of this endpoint, and the probability is supplementary.
     */
    private async _getCurrentHourProbability (query: CurrentWeatherQuery): Promise<number | null> {
        try {
            const probability = readOptionalNumber(
                (await this._getObservation(HOURLY_TIMELINE_URL, query)).point,
                "pop",
            );

            if (probability === null || probability < 0 || probability > 1) {
                return null;
            }

            return probability;
        } catch {
            return null;
        }
    }

    private async _getObservation (baseUrl: string, query: CurrentWeatherQuery): Promise<OpenWeatherObservation> {
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

        return toObservation(payload);
    }
}

function toObservation (payload: unknown): OpenWeatherObservation {
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
        throw new StormProviderError("OpenWeather response did not contain data.");
    }

    const [point] = payload.data;

    if (!isRecord(point)) {
        throw new StormProviderError("OpenWeather observation was invalid.");
    }

    return {
        timezone: typeof payload.timezone === "string" && payload.timezone.trim() ? payload.timezone : null,
        point,
    };
}

function readObservedAt (point: Record<string, unknown>): string {
    const observedAt = new Date(readRequiredNumber(point, "dt") * 1000);

    if (Number.isNaN(observedAt.getTime())) {
        throw new StormProviderError("OpenWeather field [dt] was invalid.");
    }

    return observedAt.toISOString();
}
