import { CATEGORY_SAFETY_MESSAGES } from "../domain/services/alertMessages.js";
import TrackedStorm, { TrackedStormResult } from "../domain/entities/storm/TrackedStorm.js";
import getStormArea, { StormArea } from "./getStormArea.js";

export { formatTrackedStormResponse as default };

interface ResolvedTrackedStormResponse extends TrackedStorm {
    area: StormArea;
    message: string | null;
}

function formatTrackedStormResponse (storm: TrackedStormResult): TrackedStormResult | ResolvedTrackedStormResponse {
    if (storm.status === "not_found" || storm.status === "unavailable") {
        return storm;
    }

    return {
        ...storm,
        area: getStormArea(storm),
        message: storm.category === null ? null : CATEGORY_SAFETY_MESSAGES[storm.category] ?? null,
    };
}
