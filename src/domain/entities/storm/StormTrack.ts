import StormSummary, { StormCategory, StormSource } from "./StormSummary.js";

export { StormTrack as default };
export type { StormTrackPoint };

interface StormTrackPoint {
    lat: number;
    lon: number;
    datetime: string;
    windSpeed: number | null;
    category: StormCategory | null;
    forecastHour?: number;
}

interface StormTrack {
    stormId: StormSummary["stormId"];
    name: StormSummary["name"];
    source: StormSource;
    /** Affected countries/territory from GDACS; NHC areas are derived from the basin code at the HTTP boundary. */
    area?: string | null;
    issuedAt: string;
    cachedUntil: string | null;
    observed: StormTrackPoint[];
    forecast: StormTrackPoint[];
}
