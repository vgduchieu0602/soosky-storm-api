import DeliverStormAlertPushUseCase from "../application/use-cases/alert/DeliverStormAlertPushUseCase.js";
import DetectStormAlertsUseCase from "../application/use-cases/alert/DetectStormAlertsUseCase.js";
import GetStormAlertsUseCase from "../application/use-cases/alert/GetStormAlertsUseCase.js";
import RegisterDeviceUseCase from "../application/use-cases/device/RegisterDeviceUseCase.js";
import GetMapTileUseCase from "../application/use-cases/map/GetMapTileUseCase.js";
import SendPushNotificationUseCase from "../application/use-cases/notification/SendPushNotificationUseCase.js";
import GetRadarUseCase from "../application/use-cases/radar/GetRadarUseCase.js";
import GetActiveStormsUseCase from "../application/use-cases/storm/GetActiveStormsUseCase.js";
import GetDemoStormsUseCase from "../application/use-cases/storm/GetDemoStormsUseCase.js";
import GetHistoricalStormTrackUseCase from "../application/use-cases/storm/GetHistoricalStormTrackUseCase.js";
import GetStormConeUseCase from "../application/use-cases/storm/GetStormConeUseCase.js";
import GetStormSpaghettiUseCase from "../application/use-cases/storm/GetStormSpaghettiUseCase.js";
import GetStormTrackUseCase from "../application/use-cases/storm/GetStormTrackUseCase.js";
import GetTrackedStormsUseCase from "../application/use-cases/storm/GetTrackedStormsUseCase.js";
import SaveRegionSubscriptionUseCase from "../application/use-cases/subscription/SaveRegionSubscriptionUseCase.js";
import SubscribeToStormUseCase from "../application/use-cases/subscription/SubscribeToStormUseCase.js";
import UnsubscribeFromStormUseCase from "../application/use-cases/subscription/UnsubscribeFromStormUseCase.js";
import GetCurrentWeatherUseCase from "../application/use-cases/weather/GetCurrentWeatherUseCase.js";
import GetForecastWeatherUseCase from "../application/use-cases/weather/GetForecastWeatherUseCase.js";
import type { ServerUseCases } from "../http/Server.js";
import type { AppDependencies } from "./createDependencies.js";

export { createUseCases as default };
export type { AppUseCases };

/**
 * Everything the HTTP server exposes, plus the two alert use-cases the scheduler
 * drives. Detection and delivery are not HTTP routes, but they are the same kind
 * of application action, so they are built here rather than in the scheduler.
 */
interface AppUseCases extends ServerUseCases {
    alert: ServerUseCases["alert"] & {
        detectStormAlerts: DetectStormAlertsUseCase;
        deliverStormAlertPush: DeliverStormAlertPushUseCase;
    };
}

function createUseCases (dependencies: AppDependencies): AppUseCases {
    const sendPushNotification = new SendPushNotificationUseCase(dependencies.pushNotificationRepository);
    const detectStormAlerts = new DetectStormAlertsUseCase(
        dependencies.detectionStormRepository,
        dependencies.stormStateRepository,
        dependencies.stormAlertRepository,
    );

    return {
        storm: {
            getActiveStorms: new GetActiveStormsUseCase(dependencies.stormRepository),
            getDemoStorms: new GetDemoStormsUseCase(dependencies.historicalStormTrackRepository),
            getTrackedStorms: new GetTrackedStormsUseCase(
                dependencies.stormRepository,
                dependencies.historicalStormTrackRepository,
            ),
            getStormTrack: new GetStormTrackUseCase(dependencies.stormRepository),
            getStormCone: new GetStormConeUseCase(dependencies.stormRepository),
            getStormSpaghetti: new GetStormSpaghettiUseCase(dependencies.spaghettiRepository),
            getHistoricalStormTrack: new GetHistoricalStormTrackUseCase(dependencies.historicalStormTrackRepository),
        },
        weather: {
            getForecastWeather: new GetForecastWeatherUseCase(dependencies.forecastWeatherRepository),
            getCurrentWeather: new GetCurrentWeatherUseCase(dependencies.currentWeatherRepository),
        },
        map: {
            getMapTile: new GetMapTileUseCase(dependencies.mapTileRepository),
        },
        radar: {
            getRadar: new GetRadarUseCase(dependencies.radarRepository),
        },
        notification: {
            sendPushNotification,
        },
        device: {
            registerDevice: new RegisterDeviceUseCase(dependencies.deviceRepository),
        },
        subscription: {
            subscribeToStorm: new SubscribeToStormUseCase(dependencies.stormSubscriptionRepository),
            unsubscribeFromStorm: new UnsubscribeFromStormUseCase(dependencies.stormSubscriptionRepository),
            saveRegionSubscription: new SaveRegionSubscriptionUseCase(dependencies.regionSubscriptionRepository),
        },
        alert: {
            getStormAlerts: new GetStormAlertsUseCase(dependencies.stormAlertRepository),
            detectStormAlerts,
            // Push runs after detection, never inside it: a recorded alert must not
            // depend on a device having granted notification permission.
            deliverStormAlertPush: new DeliverStormAlertPushUseCase(
                dependencies.stormSubscriptionRepository,
                dependencies.regionSubscriptionRepository,
                dependencies.alertDeliveryRepository,
                sendPushNotification,
            ),
        },
        test: dependencies.isTestModeActive ? { detectStormAlerts } : undefined,
    };
}
