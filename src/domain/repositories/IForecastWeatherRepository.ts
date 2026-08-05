import ForecastWeather, { ForecastUnits } from "../entities/ForecastWeather.js";

interface ForecastWeatherQuery {
    lat: number;
    lon: number;
    units: ForecastUnits;
}

interface ForecastWeatherRepository {
    getForecast (query: ForecastWeatherQuery): Promise<ForecastWeather>;
}

export { ForecastWeatherRepository as default };
export type { ForecastWeatherQuery };
