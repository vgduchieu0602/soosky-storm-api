import StormAlert from "../../entities/alert/StormAlert.js";

export { StormAlertRepository as default };

interface StormAlertRepository {
    /**
     * Records the alerts a detection cycle produced, before the storm states behind
     * them are updated. An alert already recorded is skipped rather than duplicated,
     * so an interrupted cycle can be replayed safely. Returns how many were new.
     */
    saveAlerts (alerts: StormAlert[]): Promise<number>;
    /** The alerts of the given storms, newest first. */
    listAlertsByTrackingIds (trackingIds: string[], limit: number): Promise<StormAlert[]>;
}
