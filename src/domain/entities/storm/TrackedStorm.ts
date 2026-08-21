import { StormCategory, StormSource } from "./StormSummary.js";

export { TrackedStorm as default };

interface TrackedStorm {
    requestedStormId: string;
    trackingId: string;
    stormId: string;
    name: string;
    source: StormSource;
    area: string | null;
    status: "active" | "dissipated";
    category: StormCategory | null;
    lat: number;
    lon: number;
    updatedAt: string;
    /** The latest official position time for a storm no longer active. */
    endedAt: string | null;
}
