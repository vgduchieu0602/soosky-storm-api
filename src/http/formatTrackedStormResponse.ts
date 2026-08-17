import { CATEGORY_SAFETY_MESSAGES } from "../domain/alertMessages.js";
import TrackedStorm from "../domain/entities/TrackedStorm.js";
import getStormArea, { StormArea } from "./getStormArea.js";

export { formatTrackedStormResponse as default };

interface TrackedStormResponse extends TrackedStorm {
    area: StormArea;
    message: string | null;
}

function formatTrackedStormResponse (storm: TrackedStorm): TrackedStormResponse {
    return {
        ...storm,
        area: getStormArea(storm),
        message: storm.category === null ? null : CATEGORY_SAFETY_MESSAGES[storm.category] ?? null,
    };
}
