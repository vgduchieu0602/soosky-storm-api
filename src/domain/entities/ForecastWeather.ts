type ForecastUnits = "standard" | "metric" | "imperial";

interface ForecastWeatherCondition {
    id: number;
    main: string;
    description: string;
    icon: string;
}

interface ForecastWeatherPoint {
    time: string;
    temp: number | null;
    humidity: number | null;
    uvi: number | null;
    visibility: number | null;
    windSpeed: number | null;
    windDeg: number | null;
    windDirection: string | null;
    pop: number | null;
    rain1hMm: number | null;
    weather: ForecastWeatherCondition[];
}

interface WeatherUnits {
    temperature: "K" | "C" | "F";
    windSpeed: "m/s" | "mph";
    visibility: "m";
    rain: "mm/h";
}

interface WeatherLocation {
    lat: number;
    lon: number;
    timezone: string | null;
}

interface ForecastWeather {
    location: WeatherLocation;
    units: WeatherUnits;
    cachedUntil: string | null;
    hourly: ForecastWeatherPoint[];
    daily: ForecastWeatherPoint[];
}

export { ForecastWeather as default };
export type {
    ForecastUnits,
    ForecastWeatherCondition,
    ForecastWeatherPoint,
    WeatherLocation,
    WeatherUnits,
};
