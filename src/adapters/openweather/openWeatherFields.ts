import { ForecastUnits, ForecastWeatherCondition, WeatherUnits } from "../../domain/entities/weather/ForecastWeather.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";

export {
    getUnits,
    getWindDirection,
    isRecord,
    readOptionalNumber,
    readRain1h,
    readRainAccumulation,
    readRequiredNumber,
    readRequiredString,
    readTimezone,
    readWeather,
};

const SECONDS_PER_HOUR = 3600;

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
    return readRainAccumulation(value, "1h");
}

function readRainAccumulation (value: unknown, key: "1h" | "3h"): number | null {
    if (value === undefined || value === null) {
        return null;
    }

    if (!isRecord(value)) {
        throw new StormProviderError("OpenWeather field [rain] was invalid.");
    }

    return readOptionalNumber(value, key);
}

/**
 * The 2.5 endpoints publish a UTC offset in seconds instead of a zone name. Whole-hour
 * offsets map onto the IANA `Etc/GMT` zones, whose sign is inverted by definition;
 * half-hour zones such as India have no `Etc/GMT` equivalent and stay null.
 */
function readTimezone (value: unknown): string | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value % SECONDS_PER_HOUR !== 0) {
        return null;
    }

    const hours = value / SECONDS_PER_HOUR;

    if (hours === 0) {
        return "UTC";
    }

    if (hours < -12 || hours > 14) {
        return null;
    }

    return "Etc/GMT" + (hours > 0 ? "-" : "+") + Math.abs(hours);
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
