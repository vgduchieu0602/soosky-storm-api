import { StormAlertType } from "../entities/alert/StormAlert.js";
import { StormCategory } from "../entities/storm/StormSummary.js";

export { CATEGORY_SAFETY_MESSAGES, buildStormAlertMessage };
export type { StormAlertContent, StormAlertMessage };

interface StormAlertMessage {
    title: string;
    description: string;
}

/**
 * What the wording needs, and no more. A full StormAlert satisfies it, so the push
 * step can re-render the same alert with a device's distance filled in.
 */
interface StormAlertContent {
    type: StormAlertType;
    stormName: string;
    previousValue: string | null;
    currentValue: string | null;
    windSpeed: number | null;
    category: StormCategory | null;
}

/** A change reads as "from X to Y", so the labels stay short. */
const CATEGORY_LABELS: Readonly<Record<string, string>> = {
    category_1: "Category 1",
    category_2: "Category 2",
    category_3: "Category 3",
    category_4: "Category 4",
    category_5: "Category 5",
};

const BELOW_CATEGORY_LABEL = "tropical storm strength";

/**
 * Deterministic safety text appended to Category 1-5 alerts. Plain templates, no
 * generation of any kind: edit this table to change what users are told.
 */
const CATEGORY_SAFETY_MESSAGES: Readonly<Partial<Record<StormCategory, string>>> = {
    category_1: "Secure loose items, check emergency supplies now",
    category_2: "Review evacuation route. Power outages likely",
    category_3: "Major hurricane. Follow evacuation orders if issued",
    category_4: "Catastrophic winds. Evacuate now if advised.",
    category_5: "Extreme danger. Leave immediately if ordered.",
};

const KNOTS_TO_KM_PER_HOUR = 1.852;

/**
 * `distanceKm` is null for the stored alert, which belongs to the storm rather than
 * to any device. Only a push delivery, which knows whose device it is addressing,
 * passes a distance.
 */
function buildStormAlertMessage (alert: StormAlertContent, distanceKm: number | null): StormAlertMessage {
    switch (alert.type) {
        case "new_storm":
            return {
                title: "New storm: " + alert.stormName,
                description: withSafety(alert, joinSentences([
                    alert.stormName + " formed" + describeDistance(distanceKm)
                    + describeMovement(alert.currentValue) + ".",
                ])),
            };
        case "category_change":
            return {
                title: alert.stormName + " " + describeCategoryTrend(alert),
                description: withSafety(alert, joinSentences([
                    describeCategoryChange(alert) + ".",
                    describeWinds(alert.windSpeed) + describeDistance(distanceKm) + ".",
                ])),
            };
        case "track_change":
            return {
                title: alert.stormName + " changed course",
                description: joinSentences([
                    "New heading: " + (alert.currentValue ?? "unknown")
                    + describePreviousHeading(alert.previousValue) + describeDistance(distanceKm) + ".",
                ]),
            };
        case "alert_level_change":
            return {
                title: alert.stormName + " alert level: " + (alert.currentValue ?? "updated"),
                description: joinSentences([
                    "The alert level for " + alert.stormName + " " + describeLevelChange(alert)
                    + describeDistance(distanceKm) + ".",
                ]),
            };
        case "watch_warning":
            return {
                title: alert.stormName + " watch/warning updated",
                description: joinSentences([
                    (alert.currentValue ?? "A watch or warning") + " applies to " + alert.stormName
                    + describeDistance(distanceKm) + ".",
                ]),
            };
        default:
            return {
                title: alert.stormName + " has dissipated",
                description: alert.stormName + " is no longer an active storm.",
            };
    }
}

function withSafety (alert: StormAlertContent, description: string): string {
    const safety = alert.category === null ? null : CATEGORY_SAFETY_MESSAGES[alert.category];

    return safety ? description + " " + safety : description;
}

/** Weakening is as newsworthy as strengthening, so both directions get their own word. */
function describeCategoryTrend (alert: StormAlertContent): string {
    return toCategoryRank(alert.currentValue) >= toCategoryRank(alert.previousValue)
        ? "strengthened"
        : "weakened";
}

function describeCategoryChange (alert: StormAlertContent): string {
    return alert.stormName + " " + describeCategoryTrend(alert)
        + " from " + describeCategoryShort(alert.previousValue)
        + " to " + describeCategoryShort(alert.currentValue);
}

function describeCategoryShort (value: string | null): string {
    return value === null ? BELOW_CATEGORY_LABEL : CATEGORY_LABELS[value] ?? BELOW_CATEGORY_LABEL;
}

/** Null means the storm is below the hurricane scale, which ranks under Category 1. */
function toCategoryRank (value: string | null): number {
    if (value === null || !(value in CATEGORY_LABELS)) {
        return 0;
    }

    return Number(value.slice("category_".length));
}

function describeLevelChange (alert: StormAlertContent): string {
    const level = alert.currentValue ?? "updated";

    return alert.previousValue === null
        ? "is now " + level
        : "changed from " + alert.previousValue + " to " + level;
}

function describePreviousHeading (previous: string | null): string {
    return previous === null ? "" : " (was " + previous + ")";
}

/** Wind speeds are stored in knots and shown in km/h, matching the message examples. */
function describeWinds (windSpeedKnots: number | null): string {
    if (windSpeedKnots === null) {
        return "Winds have changed";
    }

    return "Winds now at " + Math.round(windSpeedKnots * KNOTS_TO_KM_PER_HOUR) + " km/h";
}

function describeDistance (distanceKm: number | null): string {
    return distanceKm === null ? "" : " " + Math.round(distanceKm) + " km from your area";
}

function describeMovement (direction: string | null): string {
    return direction === null ? "" : ", moving " + direction;
}

function joinSentences (parts: string[]): string {
    return parts.join(" ").replace(/\s+/g, " ").replace(/\s+\./g, ".").trim();
}
