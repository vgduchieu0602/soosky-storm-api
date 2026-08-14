import CurrentWeather from "../../domain/entities/CurrentWeather.js";
import ForecastWeather, {
    ForecastUnits,
    ForecastWeatherCondition,
    ForecastWeatherPoint,
    WeatherUnits,
} from "../../domain/entities/ForecastWeather.js";
import { getDistanceKm, toCompassDirection } from "../../domain/geo.js";
import CurrentWeatherRepository, { CurrentWeatherQuery } from "../../domain/repositories/ICurrentWeatherRepository.js";
import ForecastWeatherRepository, { ForecastWeatherQuery } from "../../domain/repositories/IForecastWeatherRepository.js";
import { FIXTURE_ACTIVE_STORMS } from "./FixtureStormRepository.js";

export { FixtureWeatherRepository as default };

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const HOURLY_POINTS = 48;
const DAILY_POINTS = 10;
/** Inside this radius the weather reflects the fixture storm instead of a calm day. */
const STORM_RADIUS_KM = 400;
const KNOT_TO_MS = 0.514444;

const CLEAR: ForecastWeatherCondition = { id: 800, main: "Clear", description: "clear sky", icon: "01d" };
const CLOUDS: ForecastWeatherCondition = { id: 803, main: "Clouds", description: "broken clouds", icon: "04d" };
const RAIN: ForecastWeatherCondition = { id: 501, main: "Rain", description: "moderate rain", icon: "10d" };
const THUNDERSTORM: ForecastWeatherCondition = {
    id: 202,
    main: "Thunderstorm",
    description: "thunderstorm with heavy rain",
    icon: "11d",
};

interface WeatherSample {
    temperatureC: number;
    humidity: number;
    uvi: number;
    visibility: number;
    windSpeedMs: number;
    windDeg: number;
    pop: number;
    rainMmPerHour: number | null;
    weather: ForecastWeatherCondition;
}

/**
 * Deterministic weather derived from the fixture storm positions: asking for the
 * coordinates of a fixture storm returns storm conditions, anywhere else returns a
 * calm day. Same input always yields the same output, so UI snapshots stay stable.
 */
class FixtureWeatherRepository implements CurrentWeatherRepository, ForecastWeatherRepository {
    public constructor (private readonly _now: () => number = Date.now) {}

    public async getCurrentWeather (query: CurrentWeatherQuery): Promise<CurrentWeather> {
        const observedAt = floorToHour(this._now());
        const sample = getSample(query.lat, query.lon, observedAt);

        return {
            location: toLocation(query.lat, query.lon),
            units: getUnits(query.units),
            observedAt: new Date(observedAt).toISOString(),
            cachedUntil: null,
            temperature: toTemperature(sample.temperatureC, query.units),
            humidity: sample.humidity,
            uvi: sample.uvi,
            visibility: sample.visibility,
            windSpeed: toWindSpeed(sample.windSpeedMs, query.units),
            windDeg: sample.windDeg,
            windDirection: toCompassDirection(sample.windDeg),
            rain1h: sample.rainMmPerHour,
            precipitationProbability: sample.pop,
            weatherDescription: sample.weather.description,
            weather: [{ ...sample.weather }],
        };
    }

    public async getForecast (query: ForecastWeatherQuery): Promise<ForecastWeather> {
        const start = floorToHour(this._now());

        return {
            location: toLocation(query.lat, query.lon),
            units: getUnits(query.units),
            cachedUntil: null,
            hourly: Array.from({ length: HOURLY_POINTS }, (_value, index) => {
                return toPoint(query, start + (index * HOUR_MS));
            }),
            daily: Array.from({ length: DAILY_POINTS }, (_value, index) => {
                return toPoint(query, floorToNoon(start) + (index * DAY_MS));
            }),
        };
    }
}

function toPoint (query: ForecastWeatherQuery, time: number): ForecastWeatherPoint {
    const sample = getSample(query.lat, query.lon, time);

    return {
        time: new Date(time).toISOString(),
        temp: toTemperature(sample.temperatureC, query.units),
        humidity: sample.humidity,
        uvi: sample.uvi,
        visibility: sample.visibility,
        windSpeed: toWindSpeed(sample.windSpeedMs, query.units),
        windDeg: sample.windDeg,
        windDirection: toCompassDirection(sample.windDeg),
        pop: sample.pop,
        rain1hMm: sample.rainMmPerHour,
        weather: [{ ...sample.weather }],
    };
}

/**
 * The nearest fixture storm drives the sample: at the centre the wind matches the
 * storm's own wind speed, and it fades back to a calm day at {@link STORM_RADIUS_KM}.
 */
function getSample (lat: number, lon: number, time: number): WeatherSample {
    const nearest = getNearestStorm(lat, lon);
    const hourOfDay = new Date(time).getUTCHours();
    const daylight = Math.max(0, Math.sin((hourOfDay - 6) * Math.PI / 12));
    const seasonalTemperatureC = 30 - (Math.abs(lat) * 0.25);
    const dailySwingC = 3 * daylight;

    if (!nearest) {
        return {
            temperatureC: round(seasonalTemperatureC + dailySwingC - 1),
            humidity: 68,
            uvi: round(11 * daylight),
            visibility: 10_000,
            windSpeedMs: round(3.5 + daylight),
            windDeg: 95,
            pop: 0.1,
            rainMmPerHour: null,
            weather: daylight > 0.35 ? CLEAR : CLOUDS,
        };
    }

    // 1 at the storm centre, 0 at the edge of the radius.
    const intensity = 1 - (nearest.distanceKm / STORM_RADIUS_KM);
    const stormWindMs = (nearest.storm.windSpeed ?? 45) * KNOT_TO_MS;

    return {
        temperatureC: round(seasonalTemperatureC + dailySwingC - (4 * intensity)),
        humidity: Math.round(70 + (25 * intensity)),
        uvi: round(11 * daylight * (1 - (0.8 * intensity))),
        visibility: Math.round(10_000 - (8_000 * intensity)),
        windSpeedMs: round(4 + ((stormWindMs - 4) * intensity)),
        windDeg: Math.round(nearest.bearing),
        pop: round(Math.min(1, 0.2 + (0.8 * intensity))),
        rainMmPerHour: round(0.4 + (18 * intensity)),
        weather: intensity > 0.5 ? THUNDERSTORM : RAIN,
    };
}

function getNearestStorm (lat: number, lon: number) {
    const candidates = FIXTURE_ACTIVE_STORMS
        .map((storm) => ({
            storm,
            distanceKm: getDistanceKm({ lat, lon }, storm),
            // Wind blows around the centre, so the direction is the storm bearing turned 90°.
            bearing: (getStormBearing(lat, lon, storm.lat, storm.lon) + 90) % 360,
        }))
        .filter((candidate) => candidate.distanceKm <= STORM_RADIUS_KM)
        .sort((left, right) => left.distanceKm - right.distanceKm);

    return candidates[0] ?? null;
}

function getStormBearing (lat: number, lon: number, stormLat: number, stormLon: number): number {
    const latDelta = stormLat - lat;
    const lonDelta = stormLon - lon;

    if (latDelta === 0 && lonDelta === 0) {
        return 0;
    }

    return (Math.atan2(lonDelta, latDelta) * 180 / Math.PI + 360) % 360;
}

function toLocation (lat: number, lon: number) {
    return { lat, lon, timezone: "UTC" };
}

function toTemperature (celsius: number, units: ForecastUnits): number {
    if (units === "standard") {
        return round(celsius + 273.15);
    }

    if (units === "imperial") {
        return round((celsius * 9 / 5) + 32);
    }

    return round(celsius);
}

function toWindSpeed (metersPerSecond: number, units: ForecastUnits): number {
    return units === "imperial" ? round(metersPerSecond * 2.236_94) : round(metersPerSecond);
}

function getUnits (units: ForecastUnits): WeatherUnits {
    if (units === "standard") {
        return { temperature: "K", windSpeed: "m/s", visibility: "m", rain: "mm/h" };
    }

    if (units === "imperial") {
        return { temperature: "F", windSpeed: "mph", visibility: "m", rain: "mm/h" };
    }

    return { temperature: "C", windSpeed: "m/s", visibility: "m", rain: "mm/h" };
}

function floorToHour (time: number): number {
    return Math.floor(time / HOUR_MS) * HOUR_MS;
}

function floorToNoon (time: number): number {
    return (Math.floor(time / DAY_MS) * DAY_MS) + (12 * HOUR_MS);
}

function round (value: number): number {
    return Math.round(value * 10) / 10;
}
