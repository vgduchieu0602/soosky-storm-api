import { ForecastUnits, ForecastWeatherCondition, WeatherUnits } from "../../domain/entities/ForecastWeather.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";

export {
    getUnits,
    getWindDirection,
    isRecord,
    readOptionalNumber,
    readRain1h,
    readRequiredNumber,
    readRequiredString,
    readWeather,
};

const WIND_DIRECTIONS = [
    "N", "NNE", "NE", "ENE",
    "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW",
    "W", "WNW", "NW", "NNW",
];

function getUnits (units: ForecastUnits): WeatherUnits {
    if (units === "standard") {
        return { temperature: "K", windSpeed: "m/s", visibility: "m", rain: "mm/h" };
    }

    if (units === "imperial") {
        return { temperature: "F", windSpeed: "mph", visibility: "m", rain: "mm/h" };
    }

    return { temperature: "C", windSpeed: "m/s", visibility: "m", rain: "mm/h" };
}

function getWindDirection (degrees: number): string {
    const index = Math.round(((degrees % 360) + 360) % 360 / 22.5) % WIND_DIRECTIONS.length;

    return WIND_DIRECTIONS[index] ?? "N";
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
