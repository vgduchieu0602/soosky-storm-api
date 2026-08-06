import { StormCategory } from "./StormSummary.js";

export { HistoricalStormTrack as default };
export type { HistoricalStormTrackPoint };

interface HistoricalStormTrackPoint {
    lat: number;
    lon: number;
    datetime: string;
    windSpeed: number | null;
    category: StormCategory;
}

interface HistoricalStormTrack {
    stormId: string;
    name: string;
    source: "nhc";
    trackKind: "best_track" | null;
    cachedUntil: string | null;
    availability: "available" | "not_available";
    history: HistoricalStormTrackPoint[];
    reason?: string;
}
