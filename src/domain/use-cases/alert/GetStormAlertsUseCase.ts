import StormAlert from "../../entities/alert/StormAlert.js";
import { toStormTrackingId } from "../../services/stormIdentity.js";
import StormAlertRepository from "../../repositories/alert/IStormAlertRepository.js";

export { DEFAULT_ALERT_LIMIT, MAX_ALERT_LIMIT, GetStormAlertsUseCase as default };
export type { GetStormAlertsQuery };

const DEFAULT_ALERT_LIMIT = 50;
const MAX_ALERT_LIMIT = 200;

interface GetStormAlertsQuery {
    /** The storms the caller is tracking. Which device is asking is not the API's concern. */
    stormIds: string[];
    limit?: number;
}

class GetStormAlertsUseCase {
    public constructor (private readonly _alerts: StormAlertRepository) {}

    public execute (query: GetStormAlertsQuery): Promise<StormAlert[]> {
        // Alerts are keyed on the episode-free identity, while callers hold the storm
        // ID a provider published. Querying the raw ID would match no GDACS storm.
        const trackingIds = [...new Set(query.stormIds.map(toStormTrackingId))];

        return this._alerts.listAlertsByTrackingIds(trackingIds, toLimit(query.limit));
    }
}

function toLimit (limit: number | undefined): number {
    if (limit === undefined) {
        return DEFAULT_ALERT_LIMIT;
    }

    return Math.min(Math.max(limit, 1), MAX_ALERT_LIMIT);
}
