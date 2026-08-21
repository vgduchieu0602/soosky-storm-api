import { StormCategory } from "../storm/StormSummary.js";

export { STORM_ALERT_TYPES };
export type { StormAlert as default, StormAlertType };

const STORM_ALERT_TYPES = [
    "new_storm",
    "category_change",
    "track_change",
    "alert_level_change",
    "watch_warning",
    "storm_dissipated",
] as const;

type StormAlertType = (typeof STORM_ALERT_TYPES)[number];

interface StormAlert {
    type: StormAlertType;
    trackingId: string;
    stormId: string;
    stormName: string;
    signature: string;
    lat: number;
    lon: number;
    windSpeed: number | null;
    category: StormCategory | null;
    alertLevel: string | null;
    watchWarning: string | null;
    direction: string | null;
}
