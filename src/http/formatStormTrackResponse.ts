import StormTrack, { StormTrackPoint } from "../domain/entities/StormTrack.js";
import getStormArea, { StormArea } from "./getStormArea.js";

export { formatStormTrackResponse as default };

interface StormTrackResponse extends Omit<StormTrack, "area" | "observed" | "forecast"> {
    area: StormArea;
    category: StormCategoryLevel | null;
    message: string | null;
    observed: StormTrackPointResponse[];
    forecast: StormTrackPointResponse[];
}

interface StormTrackPointResponse extends Omit<StormTrackPoint, "category"> {
    category: StormCategoryLevel | null;
    message: string | null;
}

type StormCategoryLevel = 1 | 2 | 3 | 4 | 5;

const CATEGORY_MESSAGES: Readonly<Record<StormCategoryLevel, string>> = {
    1: "Secure loose items, check emergency supplies now",
    2: "Review evacuation route. Power outages likely",
    3: "Major hurricane. Follow evacuation orders if issued",
    4: "Catastrophic winds. Evacuate now if advised.",
    5: "Extreme danger. Leave immediately if ordered.",
};

function formatStormTrackResponse (track: StormTrack): StormTrackResponse {
    const observed = track.observed.map(formatPoint);
    const forecast = track.forecast.map(formatPoint);
    const current = observed.at(-1) ?? forecast[0] ?? null;

    return {
        ...track,
        area: getStormArea({
            stormId: track.stormId,
            lat: current?.lat ?? 0,
            lon: current?.lon ?? 0,
        }),
        category: current?.category ?? null,
        message: current?.message ?? null,
        observed,
        forecast,
    };
}

function formatPoint (point: StormTrackPoint): StormTrackPointResponse {
    const category = toCategoryLevel(point.category);

    return {
        ...point,
        category,
        message: category === null ? null : CATEGORY_MESSAGES[category],
    };
}

function toCategoryLevel (category: StormTrackPoint["category"]): StormCategoryLevel | null {
    switch (category) {
        case "category_1": return 1;
        case "category_2": return 2;
        case "category_3": return 3;
        case "category_4": return 4;
        case "category_5": return 5;
        default: return null;
    }
}
