export { StormSpaghetti as default };
export type {
    SpaghettiAvailability,
    StormSpaghettiModel,
    StormSpaghettiPoint,
};

const SPAGHETTI_AVAILABILITIES = [
    "available",
    "not_available",
    "not_supported",
] as const;

type SpaghettiAvailability = (typeof SPAGHETTI_AVAILABILITIES)[number];

interface StormSpaghettiPoint {
    forecastHour: number;
    lat: number;
    lon: number;
    windSpeed: number | null;
}

interface StormSpaghettiModel {
    code: string;
    label: string;
    points: StormSpaghettiPoint[];
}

interface StormSpaghetti {
    stormId: string;
    source: "nhc-atcf";
    cycleTime: string | null;
    cachedUntil: string | null;
    availability: SpaghettiAvailability;
    reason?: string;
    models: StormSpaghettiModel[];
}
