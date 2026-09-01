import ApnsPushNotificationRepository from "../adapters/apns/ApnsPushNotificationRepository.js";
import FixtureDeviceRepository from "../adapters/fixture/FixtureDeviceRepository.js";
import FixturePushNotificationRepository from "../adapters/fixture/FixturePushNotificationRepository.js";
import FixtureRegionSubscriptionRepository from "../adapters/fixture/FixtureRegionSubscriptionRepository.js";
import FixtureStormSubscriptionRepository from "../adapters/fixture/FixtureStormSubscriptionRepository.js";
import MongoDeviceRepository from "../adapters/mongo/MongoDeviceRepository.js";
import MongoRegionSubscriptionRepository from "../adapters/mongo/MongoRegionSubscriptionRepository.js";
import MongoStormSubscriptionRepository from "../adapters/mongo/MongoStormSubscriptionRepository.js";
import type { AppConfig } from "../config.js";

export { createNotificationDependencies as default };
export type { NotificationDependencies };

type NotificationDependencies = ReturnType<typeof createNotificationDependencies>;

/**
 * Push transport plus the device and subscription records that decide who a
 * storm alert is sent to. Fixture mode keeps all of it in memory so a tester
 * build never touches APNs or the database.
 */
function createNotificationDependencies (config: AppConfig, isFixtureMode: boolean) {
    return {
        pushNotificationRepository: isFixtureMode
            ? new FixturePushNotificationRepository()
            : new ApnsPushNotificationRepository(config.apns),
        deviceRepository: isFixtureMode
            ? new FixtureDeviceRepository()
            : new MongoDeviceRepository(),
        stormSubscriptionRepository: isFixtureMode
            ? new FixtureStormSubscriptionRepository()
            : new MongoStormSubscriptionRepository(),
        regionSubscriptionRepository: isFixtureMode
            ? new FixtureRegionSubscriptionRepository()
            : new MongoRegionSubscriptionRepository(),
    };
}
