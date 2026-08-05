import CachedStormRepository from "./adapters/cache/CachedStormRepository.js";
import CachedSpaghettiRepository from "./adapters/cache/CachedSpaghettiRepository.js";
import CachedForecastWeatherRepository from "./adapters/cache/CachedForecastWeatherRepository.js";
import GdacsStormConeRepository from "./adapters/gdacs/GdacsStormConeRepository.js";
import connectMongo from "./adapters/mongo/connectMongo.js";
import NhcSpaghettiRepository from "./adapters/nhc/NhcSpaghettiRepository.js";
import NhcStormRepository from "./adapters/nhc/NhcStormRepository.js";
import OpenWeatherForecastRepository from "./adapters/openweather/OpenWeatherForecastRepository.js";
import CompositeStormRepository from "./adapters/storm/CompositeStormRepository.js";
import config from "./config.js";
import GetActiveStormsUseCase from "./domain/use-cases/storm/GetActiveStormsUseCase.js";
import GetStormConeUseCase from "./domain/use-cases/storm/GetStormConeUseCase.js";
import GetStormSpaghettiUseCase from "./domain/use-cases/storm/GetStormSpaghettiUseCase.js";
import GetStormTrackUseCase from "./domain/use-cases/storm/GetStormTrackUseCase.js";
import GetForecastWeatherUseCase from "./domain/use-cases/weather/GetForecastWeatherUseCase.js";
import RateLimiter from "./http/RateLimiter.js";
import Server from "./http/Server.js";

const {
    http: {
        port: HTTP_PORT,
        host: HTTP_HOST,
    },
    nhc: {
        currentStormsUrl: NHC_CURRENT_STORMS_URL,
        aidPublicUrl: NHC_ATCF_AID_PUBLIC_URL,
        cacheTtlMs: NHC_CACHE_TTL_MS,
    },
    gdacs: {
        geometryUrl: GDACS_GEOMETRY_URL,
    },
    openWeather: {
        apiKey: OPENWEATHER_API_KEY,
    },
} = config;

const nhcStormRepository = new NhcStormRepository(NHC_CURRENT_STORMS_URL);
const gdacsStormConeRepository = new GdacsStormConeRepository(GDACS_GEOMETRY_URL);
const sourceStormRepository = new CompositeStormRepository(nhcStormRepository, gdacsStormConeRepository);
const stormRepository = new CachedStormRepository(sourceStormRepository, NHC_CACHE_TTL_MS);
const nhcSpaghettiRepository = new NhcSpaghettiRepository(NHC_ATCF_AID_PUBLIC_URL);
const spaghettiRepository = new CachedSpaghettiRepository(nhcSpaghettiRepository, NHC_CACHE_TTL_MS);
const openWeatherForecastRepository = new OpenWeatherForecastRepository(OPENWEATHER_API_KEY);
const forecastWeatherRepository = new CachedForecastWeatherRepository(openWeatherForecastRepository, 86_400_000);
const useCases = {
    storm: {
        getActiveStorms: new GetActiveStormsUseCase(stormRepository),
        getStormTrack: new GetStormTrackUseCase(stormRepository),
        getStormCone: new GetStormConeUseCase(stormRepository),
        getStormSpaghetti: new GetStormSpaghettiUseCase(spaghettiRepository),
    },
    weather: {
        getForecastWeather: new GetForecastWeatherUseCase(forecastWeatherRepository),
    },
};
const rateLimiter = new RateLimiter(config.rateLimit);

(async () => {
    try {
        await connectMongo();

        const server = new Server(config, rateLimiter, useCases);

        await server.listen();
        console.log("Soosky Storm API running on http://" + HTTP_HOST + ":" + HTTP_PORT);
    } catch (error) {
        rateLimiter.dispose();
        console.error(error);
        process.exitCode = 1;
    }
})();
