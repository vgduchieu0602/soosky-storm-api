import StormTrack, { StormTrackPoint } from "../domain/entities/storm/StormTrack.js";
import { CATEGORY_SAFETY_MESSAGES } from "../domain/services/alertMessages.js";
import getStormArea, { StormArea } from "./getStormArea.js";

export { formatStormTrackResponse as default };

interface StormTrackResponse extends Omit<StormTrack, "area" | "observed" | "forecast"> {
    area: StormArea;
    category: StormTrackPoint["category"];
    message: string | null;
    observed: StormTrackPointResponse[];
    forecast: StormTrackPointResponse[];
}

interface StormTrackPointResponse extends Omit<StormTrackPoint, "category"> {
    category: StormTrackPoint["category"];
    message: string | null;
}

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
    return {
        ...point,
        message: point.category === null ? null : CATEGORY_SAFETY_MESSAGES[point.category] ?? null,
    };
}
