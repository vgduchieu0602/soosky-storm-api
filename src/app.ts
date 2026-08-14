import CachedStormRepository from "./adapters/cache/CachedStormRepository.js";
import CachedSpaghettiRepository from "./adapters/cache/CachedSpaghettiRepository.js";
import ApnsPushNotificationRepository from "./adapters/apns/ApnsPushNotificationRepository.js";
import CachedCurrentWeatherRepository from "./adapters/cache/CachedCurrentWeatherRepository.js";
import CachedForecastWeatherRepository from "./adapters/cache/CachedForecastWeatherRepository.js";
import CachedMapTileRepository from "./adapters/cache/CachedMapTileRepository.js";
import CachedRadarRepository from "./adapters/cache/CachedRadarRepository.js";
import CachedHistoricalStormTrackRepository from "./adapters/cache/CachedHistoricalStormTrackRepository.js";
import FixtureStormRepository from "./adapters/fixture/FixtureStormRepository.js";
import FixtureSpaghettiRepository from "./adapters/fixture/FixtureSpaghettiRepository.js";
import FixtureWeatherRepository from "./adapters/fixture/FixtureWeatherRepository.js";
import GdacsStormConeRepository from "./adapters/gdacs/GdacsStormConeRepository.js";
import GdacsStormRepository from "./adapters/gdacs/GdacsStormRepository.js";
import { connectMongoInBackground, getDatabaseStatus } from "./adapters/mongo/connectMongo.js";
import MongoDeviceRepository from "./adapters/mongo/MongoDeviceRepository.js";
import MongoStormSubscriptionRepository from "./adapters/mongo/MongoStormSubscriptionRepository.js";
import MongoRegionSubscriptionRepository from "./adapters/mongo/MongoRegionSubscriptionRepository.js";
import MongoStormStateRepository from "./adapters/mongo/MongoStormStateRepository.js";
import MongoAlertDeliveryRepository from "./adapters/mongo/MongoAlertDeliveryRepository.js";
import startAlertScheduler from "./adapters/scheduler/startAlertScheduler.js";
import { isMongoConnected } from "./adapters/mongo/runMongoOperation.js";
import NhcSpaghettiRepository from "./adapters/nhc/NhcSpaghettiRepository.js";
import NhcStormRepository from "./adapters/nhc/NhcStormRepository.js";
import NhcHistoricalStormTrackRepository from "./adapters/nhc/NhcHistoricalStormTrackRepository.js";
import OpenWeatherCurrentWeatherRepository from "./adapters/openweather/OpenWeatherCurrentWeatherRepository.js";
import OpenWeatherForecastRepository from "./adapters/openweather/OpenWeatherForecastRepository.js";
import OpenWeatherMapTileRepository from "./adapters/openweather/OpenWeatherMapTileRepository.js";
import RainViewerRadarRepository from "./adapters/rainviewer/RainViewerRadarRepository.js";
import CompositeHistoricalStormTrackRepository from "./adapters/storm/CompositeHistoricalStormTrackRepository.js";
import CompositeStormRepository from "./adapters/storm/CompositeStormRepository.js";
import config from "./config.js";
import GetActiveStormsUseCase from "./domain/use-cases/storm/GetActiveStormsUseCase.js";
import GetDemoStormsUseCase from "./domain/use-cases/storm/GetDemoStormsUseCase.js";
import GetTrackedStormsUseCase from "./domain/use-cases/storm/GetTrackedStormsUseCase.js";
import GetStormConeUseCase from "./domain/use-cases/storm/GetStormConeUseCase.js";
import GetStormSpaghettiUseCase from "./domain/use-cases/storm/GetStormSpaghettiUseCase.js";
import GetStormTrackUseCase from "./domain/use-cases/storm/GetStormTrackUseCase.js";
import SendPushNotificationUseCase from "./domain/use-cases/notification/SendPushNotificationUseCase.js";
import RegisterDeviceUseCase from "./domain/use-cases/device/RegisterDeviceUseCase.js";
import SubscribeToStormUseCase from "./domain/use-cases/subscription/SubscribeToStormUseCase.js";
import UnsubscribeFromStormUseCase from "./domain/use-cases/subscription/UnsubscribeFromStormUseCase.js";
import SaveRegionSubscriptionUseCase from "./domain/use-cases/subscription/SaveRegionSubscriptionUseCase.js";
import DetectStormAlertsUseCase from "./domain/use-cases/alert/DetectStormAlertsUseCase.js";
import GetCurrentWeatherUseCase from "./domain/use-cases/weather/GetCurrentWeatherUseCase.js";
import GetForecastWeatherUseCase from "./domain/use-cases/weather/GetForecastWeatherUseCase.js";
import GetMapTileUseCase from "./domain/use-cases/map/GetMapTileUseCase.js";
import GetRadarUseCase from "./domain/use-cases/radar/GetRadarUseCase.js";
import GetHistoricalStormTrackUseCase from "./domain/use-cases/storm/GetHistoricalStormTrackUseCase.js";
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
        archiveUrl: NHC_ATCF_ARCHIVE_URL,
    },
    cache: {
        stormTtlMs: STORM_CACHE_TTL_MS,
        activeStormsTtlMs: ACTIVE_STORMS_CACHE_TTL_MS,
        historicalStormTrackTtlMs: HISTORICAL_STORM_TRACK_CACHE_TTL_MS,
        forecastWeatherTtlMs: FORECAST_WEATHER_CACHE_TTL_MS,
        currentWeatherTtlMs: CURRENT_WEATHER_CACHE_TTL_MS,
        mapTileTtlMs: MAP_TILE_CACHE_TTL_MS,
        radarTtlMs: RADAR_CACHE_TTL_MS,
    },
    gdacs: {
        geometryUrl: GDACS_GEOMETRY_URL,
        eventListUrl: GDACS_EVENT_LIST_URL,
        eventDataUrl: GDACS_EVENT_DATA_URL,
    },
    openWeather: {
        apiKey: OPENWEATHER_API_KEY,
    },
} = config;

const nhcStormRepository = new NhcStormRepository(NHC_CURRENT_STORMS_URL);
const gdacsStormConeRepository = new GdacsStormConeRepository(GDACS_GEOMETRY_URL);
const gdacsStormRepository = new GdacsStormRepository(
    GDACS_EVENT_LIST_URL,
    GDACS_EVENT_DATA_URL,
    GDACS_GEOMETRY_URL,
);
// Fixture mode is deliberately selected at composition time. Production keeps
// using providers by default; staging/test can serve deterministic local data
// without depending on an active storm or an upstream service.
const fixtureStormRepository = config.stormDataMode === "fixture"
    ? new FixtureStormRepository()
    : null;
const sourceStormRepository = fixtureStormRepository ?? new CompositeStormRepository(
    nhcStormRepository,
    gdacsStormConeRepository,
    gdacsStormRepository,
);
const stormRepository = new CachedStormRepository(
    sourceStormRepository,
    STORM_CACHE_TTL_MS,
    ACTIVE_STORMS_CACHE_TTL_MS,
);
const sourceSpaghettiRepository = fixtureStormRepository
    ? new FixtureSpaghettiRepository()
    : new NhcSpaghettiRepository(NHC_ATCF_AID_PUBLIC_URL);
const spaghettiRepository = new CachedSpaghettiRepository(sourceSpaghettiRepository, STORM_CACHE_TTL_MS);

// One fixture instance serves both weather ports so the forecast and the current
// observation agree with each other and with the fixture storm positions.
const fixtureWeatherRepository = fixtureStormRepository ? new FixtureWeatherRepository() : null;
const forecastWeatherRepository = new CachedForecastWeatherRepository(
    fixtureWeatherRepository ?? new OpenWeatherForecastRepository(OPENWEATHER_API_KEY),
    FORECAST_WEATHER_CACHE_TTL_MS,
);
const currentWeatherRepository = new CachedCurrentWeatherRepository(
    fixtureWeatherRepository ?? new OpenWeatherCurrentWeatherRepository(OPENWEATHER_API_KEY),
    CURRENT_WEATHER_CACHE_TTL_MS,
);
const mapTileRepository = new CachedMapTileRepository(
    new OpenWeatherMapTileRepository(OPENWEATHER_API_KEY),
    MAP_TILE_CACHE_TTL_MS,
);
const radarRepository = new CachedRadarRepository(new RainViewerRadarRepository(), RADAR_CACHE_TTL_MS);
const pushNotificationRepository = new ApnsPushNotificationRepository(config.apns);
const deviceRepository = new MongoDeviceRepository();
const stormSubscriptionRepository = new MongoStormSubscriptionRepository();
const regionSubscriptionRepository = new MongoRegionSubscriptionRepository();
const stormStateRepository = new MongoStormStateRepository();
const alertDeliveryRepository = new MongoAlertDeliveryRepository();
const historicalStormTrackRepository = new CachedHistoricalStormTrackRepository(
    fixtureStormRepository ?? new CompositeHistoricalStormTrackRepository(
        new NhcHistoricalStormTrackRepository(NHC_CURRENT_STORMS_URL, fetch, NHC_ATCF_ARCHIVE_URL),
        gdacsStormRepository,
    ),
    HISTORICAL_STORM_TRACK_CACHE_TTL_MS,
);
const sendPushNotification = new SendPushNotificationUseCase(pushNotificationRepository);
// Alerts read the uncached provider composite: detection latency must not be
// bounded by the storm-list cache the HTTP endpoints use.
const detectStormAlerts = new DetectStormAlertsUseCase(
    sourceStormRepository,
    stormStateRepository,
    stormSubscriptionRepository,
    regionSubscriptionRepository,
    alertDeliveryRepository,
    sendPushNotification,
);
const useCases = {
    storm: {
        getActiveStorms: new GetActiveStormsUseCase(stormRepository),
        getDemoStorms: new GetDemoStormsUseCase(historicalStormTrackRepository),
        getTrackedStorms: new GetTrackedStormsUseCase(stormRepository, historicalStormTrackRepository),
        getStormTrack: new GetStormTrackUseCase(stormRepository),
        getStormCone: new GetStormConeUseCase(stormRepository),
        getStormSpaghetti: new GetStormSpaghettiUseCase(spaghettiRepository),
        getHistoricalStormTrack: new GetHistoricalStormTrackUseCase(historicalStormTrackRepository),
    },
    weather: {
        getForecastWeather: new GetForecastWeatherUseCase(forecastWeatherRepository),
        getCurrentWeather: new GetCurrentWeatherUseCase(currentWeatherRepository),
    },
    map: {
        getMapTile: new GetMapTileUseCase(mapTileRepository),
    },
    radar: {
        getRadar: new GetRadarUseCase(radarRepository),
    },
    notification: {
        sendPushNotification,
    },
    device: {
        registerDevice: new RegisterDeviceUseCase(deviceRepository),
    },
    subscription: {
        subscribeToStorm: new SubscribeToStormUseCase(stormSubscriptionRepository),
        unsubscribeFromStorm: new UnsubscribeFromStormUseCase(stormSubscriptionRepository),
        saveRegionSubscription: new SaveRegionSubscriptionUseCase(regionSubscriptionRepository),
    },
};
const rateLimiter = new RateLimiter(config.rateLimit);

(async () => {
    try {
        const server = new Server(config, rateLimiter, useCases, getDatabaseStatus);

        await server.listen();
        console.log("Soosky Storm API running on http://" + HTTP_HOST + ":" + HTTP_PORT);

        void connectMongoInBackground();

        if (config.alerts.enabled && config.stormDataMode === "live") {
            startAlertScheduler(detectStormAlerts, {
                intervalMs: config.alerts.pollIntervalMs,
                isReady: isMongoConnected,
            });
            console.log("Storm alert detection every " + config.alerts.pollIntervalMs + " ms.");
        } else if (config.alerts.enabled) {
            console.log("Storm alert detection disabled while STORM_DATA_MODE=fixture.");
        }
    } catch (error) {
        rateLimiter.dispose();
        console.error(error);
        process.exitCode = 1;
    }
})();
