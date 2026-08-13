import StormAlert from "./entities/StormAlert.js";
import { StormCategory } from "./entities/StormSummary.js";

export { CATEGORY_SAFETY_MESSAGES, buildStormAlertMessage };
export type { StormAlertMessage };

interface StormAlertMessage {
    title: string;
    description: string;
}

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
    tropical_depression: "a tropical depression",
    tropical_storm: "a tropical storm",
    category_1: "a Category 1 hurricane",
    category_2: "a Category 2 hurricane",
    category_3: "a Category 3 hurricane",
    category_4: "a Category 4 hurricane",
    category_5: "a Category 5 hurricane",
    unknown: "of unknown strength",
};

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

function buildStormAlertMessage (alert: StormAlert, distanceKm: number | null): StormAlertMessage {
    switch (alert.type) {
        case "new_storm":
            return {
                title: "New storm: " + alert.stormName,
                description: withSafety(alert, joinSentences([
                    alert.stormName + " formed" + describeDistance(distanceKm) + describeMovement(alert.direction) + ".",
                ])),
            };
        case "category_change":
            return {
                title: alert.stormName + " is now " + describeCategory(alert.category),
                description: withSafety(alert, joinSentences([
                    describeWinds(alert.windSpeed) + describeDistance(distanceKm) + ".",
                ])),
            };
        case "track_change":
            return {
                title: alert.stormName + " changed course",
                description: joinSentences([
                    "New heading: " + (alert.direction ?? "unknown") + describeDistance(distanceKm) + ".",
                ]),
            };
        case "alert_level_change":
            return {
                title: alert.stormName + " alert level: " + (alert.alertLevel ?? "updated"),
                description: joinSentences([
                    "The alert level for " + alert.stormName + " is now "
                    + (alert.alertLevel ?? "updated") + describeDistance(distanceKm) + ".",
                ]),
            };
        default:
            return {
                title: alert.stormName + " has dissipated",
                description: "No longer an active threat to your area.",
            };
    }
}

function withSafety (alert: StormAlert, description: string): string {
    const safety = CATEGORY_SAFETY_MESSAGES[alert.category as StormCategory];

    return safety ? description + " " + safety : description;
}

function describeCategory (category: string): string {
    return CATEGORY_LABELS[category] ?? "a tropical cyclone";
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
