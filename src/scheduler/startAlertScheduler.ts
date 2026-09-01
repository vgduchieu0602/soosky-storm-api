import DeliverStormAlertPushUseCase from "../application/use-cases/alert/DeliverStormAlertPushUseCase.js";
import DetectStormAlertsUseCase from "../application/use-cases/alert/DetectStormAlertsUseCase.js";

export { startAlertScheduler as default };
export type { AlertScheduler, AlertSchedulerOptions };

interface AlertSchedulerOptions {
    intervalMs: number;
    /**
     * Pushes the alerts a cycle recorded. Optional: without it alerts are still
     * detected and stored, and the in-app alerts screen keeps working.
     */
    deliverStormAlertPush?: DeliverStormAlertPushUseCase | null;
    /** Cycles are skipped while this returns false, e.g. with the database down. */
    isReady?: () => boolean;
    log?: (message: string) => void;
    logError?: (message: string) => void;
}

interface AlertScheduler {
    runOnce (): Promise<void>;
    stop (): void;
}

/**
 * A plain interval timer: no broker, no queue, no worker process. Cycles never
 * overlap, and a failed cycle is logged and retried on the next tick rather than
 * taking the process down.
 */
function startAlertScheduler (
    detectStormAlerts: DetectStormAlertsUseCase,
    options: AlertSchedulerOptions,
): AlertScheduler {
    const deliverStormAlertPush = options.deliverStormAlertPush ?? null;
    const isReady = options.isReady ?? (() => true);
    const log = options.log ?? ((message: string) => console.log(message));
    const logError = options.logError ?? ((message: string) => console.error(message));
    let running = false;

    const runOnce = async (): Promise<void> => {
        if (running) {
            log("Storm alert cycle skipped: the previous cycle is still running.");
            return;
        }

        if (!isReady()) {
            return;
        }

        running = true;

        try {
            const result = await detectStormAlerts.execute();
            // Detection has already stored the alerts. A push failure past this point
            // costs a notification, never the alert itself.
            const delivery = deliverStormAlertPush
                ? await deliverStormAlertPush.execute(result.alerts)
                : null;

            if (result.alerts.length) {
                log(
                    "Storm alert cycle: " + result.stormsSeen + " storms, "
                    + result.alerts.length + " alerts, " + result.saved + " saved, "
                    + result.skippedAsDuplicate + " already recorded"
                    + (delivery ? ", " + delivery.sent + " pushed, " + delivery.failed + " failed" : "")
                    + ".",
                );
            }
        } catch (error) {
            logError("Storm alert cycle failed: " + toErrorMessage(error));
        } finally {
            running = false;
        }
    };

    const timer = setInterval(() => {
        void runOnce();
    }, options.intervalMs);

    timer.unref();

    return {
        runOnce,
        stop: () => clearInterval(timer),
    };
}

function toErrorMessage (error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
