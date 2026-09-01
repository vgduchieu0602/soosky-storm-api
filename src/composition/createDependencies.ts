import { getDatabaseStatus } from "../adapters/mongo/connectMongo.js";
import TestableActiveStormsRepository from "../adapters/storm/TestableActiveStormsRepository.js";
import type { AppConfig } from "../config.js";
import type { TestModeState } from "../http/Server.js";
import createAlertDependencies from "./createAlertDependencies.js";
import createNotificationDependencies from "./createNotificationDependencies.js";
import createStormDependencies from "./createStormDependencies.js";
import createWeatherDependencies from "./createWeatherDependencies.js";

export { createDependencies as default };
export type { AppDependencies };

type AppDependencies = ReturnType<typeof createDependencies>;

/**
 * The single place every concrete adapter is chosen and wired. Use-cases receive
 * the result and never learn whether they are running on live providers or fixtures.
 */
function createDependencies (config: AppConfig) {
    const storm = createStormDependencies(config);
    const weather = createWeatherDependencies(config, storm.isFixtureMode);
    const notification = createNotificationDependencies(config, storm.isFixtureMode);
    const alert = createAlertDependencies(config, storm);

    const testModeState: TestModeState | null = alert.isTestModeActive
        ? {
            hiddenStormIds: alert.hiddenStormIds,
            testableStormRepository: alert.detectionStormRepository as TestableActiveStormsRepository,
            sourceStormRepository: storm.sourceStormRepository,
            stormStateRepository: alert.stormStateRepository,
        }
        : null;

    return {
        ...storm,
        ...weather,
        ...notification,
        ...alert,
        testModeState,
        // Fixture mode reports its own status: it never opens a database connection.
        getDatabaseStatus: storm.isFixtureMode ? () => "fixture" : getDatabaseStatus,
    };
}
