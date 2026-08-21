import { StormCategory } from "../storm/StormSummary.js";

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
    /**
     * The provider's observation time for this snapshot. A dissipation alert has no
     * live storm to read it from, so the last observed value is what identifies it.
     * Null only for rows written before this field existed.
     */
    datetime: string | null;
}
