import { CATEGORY_SAFETY_MESSAGES } from "../domain/alertMessages.js";
import StormSummary from "../domain/entities/StormSummary.js";
import getStormArea, { StormArea } from "./getStormArea.js";

export { formatStormSummaryResponse as default };

interface StormSummaryResponse extends StormSummary {
    area: StormArea;
    message: string | null;
}

function formatStormSummaryResponse (summary: StormSummary): StormSummaryResponse {
    return {
        ...summary,
        area: getStormArea(summary),
        message: CATEGORY_SAFETY_MESSAGES[summary.category] ?? null,
    };
}
