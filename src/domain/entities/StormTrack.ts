import StormSummary, { StormCategory } from "./StormSummary.js";

export { StormTrack as default };
export type { StormTrackPoint };

interface StormTrackPoint {
    lat: number;
    lon: number;
    datetime: string;
    windSpeed: number | null;
    category: StormCategory;
    forecastHour?: number;
}

interface StormTrack {
    stormId: StormSummary["stormId"];
    name: StormSummary["name"];
    source: "nhc";
    issuedAt: string;
    cachedUntil: string | null;
    observed: StormTrackPoint[];
    forecast: StormTrackPoint[];
}
