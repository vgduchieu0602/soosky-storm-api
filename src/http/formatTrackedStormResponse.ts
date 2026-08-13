import { CATEGORY_SAFETY_MESSAGES } from "../domain/alertMessages.js";
import TrackedStorm from "../domain/entities/TrackedStorm.js";
import getStormArea, { StormArea } from "./getStormArea.js";

export { formatTrackedStormResponse as default };

interface TrackedStormResponse extends Omit<TrackedStorm, "category"> {
    area: StormArea;
    category: 1 | 2 | 3 | 4 | 5 | null;
    message: string | null;
}

function formatTrackedStormResponse (storm: TrackedStorm): TrackedStormResponse {
    const category = toCategoryLevel(storm.category);

    return {
        ...storm,
        area: getStormArea(storm),
        category,
        message: category === null ? null : CATEGORY_SAFETY_MESSAGES[storm.category] ?? null,
    };
}

function toCategoryLevel (category: TrackedStorm["category"]): 1 | 2 | 3 | 4 | 5 | null {
    switch (category) {
        case "category_1": return 1;
        case "category_2": return 2;
        case "category_3": return 3;
        case "category_4": return 4;
        case "category_5": return 5;
        default: return null;
    }
}
