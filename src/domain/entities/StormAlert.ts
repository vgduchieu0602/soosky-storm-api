export { STORM_ALERT_TYPES };
export type { StormAlert as default, StormAlertType };

const STORM_ALERT_TYPES = [
    "new_storm",
    "category_change",
    "track_change",
    "alert_level_change",
    "storm_dissipated",
] as const;

type StormAlertType = (typeof STORM_ALERT_TYPES)[number];

interface StormAlert {
    type: StormAlertType;
    trackingId: string;
    stormId: string;
    stormName: string;
    /** Distinguishes one occurrence of an alert from the next, e.g. the new category. */
    signature: string;
    lat: number;
    lon: number;
    windSpeed: number | null;
    category: string;
    alertLevel: string | null;
    direction: string | null;
}
