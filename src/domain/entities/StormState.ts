import { StormCategory } from "./StormSummary.js";

export type { StormState as default };

/** The last observed snapshot of a storm, used to detect what changed since. */
interface StormState {
    /** Episode-free identity of the storm; the key this snapshot is stored under. */
    trackingId: string;
    /** The most recent full storm ID, which for GDACS carries the episode. */
    stormId: string;
    name: string;
    lat: number;
    lon: number;
    windSpeed: number | null;
    category: StormCategory;
    alertLevel: string | null;
    watchWarning: string | null;
    /** Compass bearing of the storm's last observed movement, null until it moves. */
    bearing: number | null;
}
