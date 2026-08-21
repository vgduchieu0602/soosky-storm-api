import ForecastWeather from "../../entities/weather/ForecastWeather.js";
import ForecastWeatherRepository, { ForecastWeatherQuery } from "../../repositories/weather/IForecastWeatherRepository.js";

class GetForecastWeatherUseCase {
    public constructor (
        private readonly _forecastWeatherRepository: ForecastWeatherRepository,
    ) {}

    public execute (query: ForecastWeatherQuery): Promise<ForecastWeather> {
        return this._forecastWeatherRepository.getForecast(query);
    }
}

export { GetForecastWeatherUseCase as default };
