import { connectMongoInBackground } from "./adapters/mongo/connectMongo.js";
import { isMongoConnected } from "./adapters/mongo/runMongoOperation.js";
import createDependencies from "./composition/createDependencies.js";
import createUseCases from "./composition/createUseCases.js";
import config from "./config.js";
import Server from "./http/Server.js";
import startAlertScheduler from "./scheduler/startAlertScheduler.js";

const dependencies = createDependencies(config);
const useCases = createUseCases(dependencies);

(async () => {
    try {
        const server = new Server(
            config,
            useCases,
            dependencies.getDatabaseStatus,
            dependencies.testModeState,
        );

        await server.listen();
        console.log("Soosky Storm API running on http://" + config.http.host + ":" + config.http.port);

        if (!dependencies.isFixtureMode) {
            void connectMongoInBackground();
        }

        startAlerts();
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
})();

function startAlerts (): void {
    if (!config.alerts.enabled) {
        return;
    }

    // Detection needs a real storm source: fixture mode serves seeded alerts instead.
    if (dependencies.isFixtureMode) {
        console.log("Storm alert detection disabled while STORM_DATA_MODE=fixture.");
        return;
    }

    startAlertScheduler(useCases.alert.detectStormAlerts, {
        intervalMs: config.alerts.pollIntervalMs,
        deliverStormAlertPush: useCases.alert.deliverStormAlertPush,
        isReady: isMongoConnected,
    });
    console.log("Storm alert detection every " + config.alerts.pollIntervalMs + " ms.");
}
