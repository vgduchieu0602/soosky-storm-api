import StormSummary from "../domain/entities/storm/StormSummary.js";
import getStormArea, { StormArea } from "./getStormArea.js";

export { formatStormSummaryResponse as default };

interface StormSummaryResponse extends StormSummary {
    area: StormArea;
}

function formatStormSummaryResponse (summary: StormSummary): StormSummaryResponse {
    return {
        ...summary,
        area: getStormArea(summary),
    };
}
