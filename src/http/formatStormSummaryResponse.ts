import { CATEGORY_SAFETY_MESSAGES } from "../domain/alertMessages.js";
import StormSummary from "../domain/entities/StormSummary.js";

export { formatStormSummaryResponse as default };

interface StormSummaryResponse extends StormSummary {
    area: string | null;
    message: string | null;
}

function formatStormSummaryResponse (summary: StormSummary): StormSummaryResponse {
    return {
        ...summary,
        area: summary.area ?? getNhcArea(summary.stormId),
        message: CATEGORY_SAFETY_MESSAGES[summary.category] ?? null,
    };
}

function getNhcArea (stormId: string): string | null {
    switch (stormId.slice(4, 6)) {
        case "AL": return "North Atlantic Ocean";
        case "EP": return "Eastern North Pacific Ocean";
        case "CP": return "Central North Pacific Ocean";
        default: return null;
    }
}
