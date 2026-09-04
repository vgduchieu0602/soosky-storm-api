import TrackedStorm, { TrackedStormResult } from "../domain/entities/storm/TrackedStorm.js";
import getStormArea, { StormArea } from "./getStormArea.js";

export { formatTrackedStormResponse as default };

interface ResolvedTrackedStormResponse extends TrackedStorm {
    area: StormArea;
}

function formatTrackedStormResponse (storm: TrackedStormResult): TrackedStormResult | ResolvedTrackedStormResponse {
    if (storm.status === "not_found" || storm.status === "unavailable") {
        return storm;
    }

    return {
        ...storm,
        area: getStormArea(storm),
    };
}
