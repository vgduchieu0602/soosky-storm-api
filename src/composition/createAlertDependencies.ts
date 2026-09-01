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

/**
 * Alert detection state and the storm source detection reads.
 *
 * STORM_ALERT_TEST_MODE wraps the live source so a tester can simulate a storm
 * disappearing. It requires live data: fixture mode has no detection cycle to test.
 */
function createAlertDependencies (config: AppConfig, storm: StormDependencies) {
    const isTestModeActive = config.alerts.testMode && config.stormDataMode === "live";
    const hiddenStormIds = new Set<string>();

    return {
        isTestModeActive,
        hiddenStormIds,
        stormStateRepository: new MongoStormStateRepository(),
        // Fixture mode seeds a few alerts so the in-app alerts screen has something
        // to show: the detection scheduler does not run without live data.
        stormAlertRepository: storm.isFixtureMode
            ? new FixtureStormAlertRepository()
            : new MongoStormAlertRepository(),
        alertDeliveryRepository: new MongoAlertDeliveryRepository(),
        detectionStormRepository: isTestModeActive
            ? new TestableActiveStormsRepository(storm.sourceStormRepository, hiddenStormIds, true)
            : storm.sourceStormRepository,
    };
}
