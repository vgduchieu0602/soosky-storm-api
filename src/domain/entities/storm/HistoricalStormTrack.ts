import { StormCategory, StormSource } from "./StormSummary.js";

export { HistoricalStormTrack as default };
export type { HistoricalStormTrackPoint };

interface HistoricalStormTrackPoint {
    lat: number;
    lon: number;
    datetime: string;
    windSpeed: number | null;
    category: StormCategory | null;
}

interface HistoricalStormTrack {
    stormId: string;
    name: string;
    source: StormSource;
    trackKind: "best_track" | "gdacs_observed_track" | null;
    cachedUntil: string | null;
    availability: "available" | "not_available";
    history: HistoricalStormTrackPoint[];
    reason?: string;
}
