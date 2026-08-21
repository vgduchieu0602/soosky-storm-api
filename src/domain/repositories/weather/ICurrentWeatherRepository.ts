import CurrentWeather from "../../entities/weather/CurrentWeather.js";
import { ForecastUnits } from "../../entities/weather/ForecastWeather.js";

export { CurrentWeatherRepository as default };
export type { CurrentWeatherQuery };

interface CurrentWeatherQuery {
    lat: number;
    lon: number;
    units: ForecastUnits;
}

interface CurrentWeatherRepository {
    getCurrentWeather (query: CurrentWeatherQuery): Promise<CurrentWeather>;
}
