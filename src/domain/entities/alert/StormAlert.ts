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

/**
 * One recorded change of one storm. It belongs to the storm, not to a device: no
 * field here identifies a user, and the record is never rewritten or deleted.
 */
interface StormAlert {
    /**
     * Derived from the change itself rather than generated, so re-detecting the same
     * change after an interrupted cycle writes the same row instead of a second one.
     */
    id: string;
    type: StormAlertType;
    trackingId: string;
    stormId: string;
    stormName: string;
    previousValue: string | null;
    currentValue: string | null;
    lat: number;
    lon: number;
    windSpeed: number | null;
    category: StormCategory | null;
    title: string;
    description: string;
    /** The provider's observation time, which is what the change actually happened at. */
    observedAt: string;
    /** When this backend detected and recorded the change. */
    createdAt: string;
}
