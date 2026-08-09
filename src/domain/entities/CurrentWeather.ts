import { ForecastWeatherCondition, WeatherLocation, WeatherUnits } from "./ForecastWeather.js";

export { CurrentWeather as default };

interface CurrentWeather {
    location: WeatherLocation;
    units: WeatherUnits;
    observedAt: string;
    cachedUntil: string | null;
    temperature: number | null;
    humidity: number | null;
    uvi: number | null;
    visibility: number | null;
    windSpeed: number | null;
    windDeg: number | null;
    windDirection: string | null;
    rain1h: number | null;
    precipitationProbability: number | null;
    weatherDescription: string | null;
    weather: ForecastWeatherCondition[];
}
