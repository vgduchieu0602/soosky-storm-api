import CurrentWeather from "../../entities/CurrentWeather.js";
import CurrentWeatherRepository, { CurrentWeatherQuery } from "../../repositories/ICurrentWeatherRepository.js";

class GetCurrentWeatherUseCase {
    public constructor (
        private readonly _currentWeatherRepository: CurrentWeatherRepository,
    ) {}

    public execute (query: CurrentWeatherQuery): Promise<CurrentWeather> {
        return this._currentWeatherRepository.getCurrentWeather(query);
    }
}

export { GetCurrentWeatherUseCase as default };
