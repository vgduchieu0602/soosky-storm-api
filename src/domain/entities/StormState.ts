import { StormCategory } from "./StormSummary.js";

export type { StormState as default };

interface StormState {
    trackingId: string;
    stormId: string;
    name: string;
    lat: number;
    lon: number;
    windSpeed: number | null;
    category: StormCategory | null;
    alertLevel: string | null;
    watchWarning: string | null;
    bearing: number | null;
}
