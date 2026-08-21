import CurrentWeather from "../../entities/weather/CurrentWeather.js";
import CurrentWeatherRepository, { CurrentWeatherQuery } from "../../repositories/weather/ICurrentWeatherRepository.js";

class GetCurrentWeatherUseCase {
    public constructor (
        private readonly _currentWeatherRepository: CurrentWeatherRepository,
    ) {}

    public execute (query: CurrentWeatherQuery): Promise<CurrentWeather> {
        return this._currentWeatherRepository.getCurrentWeather(query);
    }
}

export { GetCurrentWeatherUseCase as default };
