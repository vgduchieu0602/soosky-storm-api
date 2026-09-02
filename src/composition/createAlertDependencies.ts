import FixtureStormAlertRepository from "../adapters/fixture/FixtureStormAlertRepository.js";
import MongoAlertDeliveryRepository from "../adapters/mongo/MongoAlertDeliveryRepository.js";
import MongoStormAlertRepository from "../adapters/mongo/MongoStormAlertRepository.js";
import MongoStormStateRepository from "../adapters/mongo/MongoStormStateRepository.js";
import TestableActiveStormsRepository from "../adapters/storm/TestableActiveStormsRepository.js";
import type { AppConfig } from "../config.js";
import type { StormDependencies } from "./createStormDependencies.js";

export { createAlertDependencies as default };
export type { AlertDependencies };

type AlertDependencies = ReturnType<typeof createAlertDependencies>;

function createAlertDependencies (config: AppConfig, storm: StormDependencies) {
    const isTestModeActive = config.alerts.testMode && config.stormDataMode === "live";
    const hiddenStormIds = new Set<string>();

    return {
        isTestModeActive,
        hiddenStormIds,
        stormStateRepository: new MongoStormStateRepository(),
        stormAlertRepository: storm.isFixtureMode
            ? new FixtureStormAlertRepository()
            : new MongoStormAlertRepository(),
        alertDeliveryRepository: new MongoAlertDeliveryRepository(),
        detectionStormRepository: isTestModeActive
            ? new TestableActiveStormsRepository(storm.sourceStormRepository, hiddenStormIds, true)
            : storm.sourceStormRepository,
    };
}