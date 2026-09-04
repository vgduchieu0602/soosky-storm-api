import StormTrack, { StormTrackPoint } from "../domain/entities/storm/StormTrack.js";
import getStormArea, { StormArea } from "./getStormArea.js";

export { formatStormTrackResponse as default };

interface StormTrackResponse extends Omit<StormTrack, "area"> {
    area: StormArea;
    category: StormTrackPoint["category"];
}

function formatStormTrackResponse (track: StormTrack): StormTrackResponse {
    const { observed, forecast } = track;
    const current = observed.at(-1) ?? forecast[0] ?? null;

    return {
        ...track,
        area: getStormArea({
            stormId: track.stormId,
            lat: current?.lat ?? 0,
            lon: current?.lon ?? 0,
        }),
        category: current?.category ?? null,
        observed,
        forecast,
    };
}
