import HistoricalStormTrack from "../../domain/entities/HistoricalStormTrack.js";
import StormCone from "../../domain/entities/StormCone.js";
import StormSummary from "../../domain/entities/StormSummary.js";
import StormTrack from "../../domain/entities/StormTrack.js";
import StormNotFoundError from "../../domain/errors/StormNotFoundError.js";
import HistoricalStormTrackRepository from "../../domain/repositories/IHistoricalStormTrackRepository.js";
import StormRepository from "../../domain/repositories/IStormRepository.js";

export { FixtureStormRepository as default, ACTIVE_STORMS as FIXTURE_ACTIVE_STORMS };

/**
 * Stable, representative storm profiles for staging and UI testing. They are
 * intentionally local so a provider outage or a quiet hurricane season cannot
 * leave the application without test data.
 */
class FixtureStormRepository implements StormRepository, HistoricalStormTrackRepository {
    public async getActiveStorms (): Promise<StormSummary[]> {
        return ACTIVE_STORMS.map(cloneStormSummary);
    }

    public async getStormTrack (stormId: string): Promise<StormTrack> {
        const track = TRACKS[stormId];

        if (!track) {
            throw new StormNotFoundError(stormId);
        }

        return cloneStormTrack(track);
    }

    public async getStormCone (stormId: string): Promise<StormCone> {
        const cone = CONES[stormId];

        if (!cone) {
            throw new StormNotFoundError(stormId);
        }

        return structuredClone(cone);
    }

    public async getHistoricalStormTrack (stormId: string): Promise<HistoricalStormTrack> {
        const profile = HISTORICAL_STORMS[stormId];

        if (!profile) {
            throw new StormNotFoundError(stormId);
        }

        return {
            stormId,
            name: profile.name,
            source: "nhc",
            trackKind: "best_track",
            cachedUntil: null,
            availability: "available",
            history: profile.history.map((point) => ({ ...point })),
        };
    }
}

const ACTIVE_STORMS: readonly StormSummary[] = [
    {
        stormId: "nhc:AL012026",
        name: "TROPICAL DEPRESSION ANDREW",
        source: "nhc",
        basin: "north_atlantic",
        lat: 12.6,
        lon: -45.8,
        datetime: "2026-08-08T06:00:00.000Z",
        windSpeed: 30,
        category: null,
        alertLevel: null,
        watchWarning: null,
    },
    {
        stormId: "nhc:AL022026",
        name: "TROPICAL STORM BERYL",
        source: "nhc",
        basin: "north_atlantic",
        lat: 22.4,
        lon: -77.8,
        datetime: "2026-07-19T18:00:00.000Z",
        windSpeed: 60,
        category: null,
        alertLevel: null,
        watchWarning: "Storm surge watch/warning advisory 2026-07-19T18:00:00.000Z",
    },
    {
        stormId: "nhc:AL032026",
        name: "HURRICANE CHARLIE",
        source: "nhc",
        basin: "north_atlantic",
        lat: 25.1,
        lon: -68.3,
        datetime: "2026-08-08T12:00:00.000Z",
        windSpeed: 75,
        category: "category_1",
        alertLevel: null,
        watchWarning: "Hurricane watch for the northern Leeward Islands.",
    },
    {
        stormId: "nhc:EP072026",
        name: "HURRICANE GENEVIEVE",
        source: "nhc",
        basin: "eastern_north_pacific",
        lat: 19.4,
        lon: -116.6,
        datetime: "2026-08-08T12:00:00.000Z",
        windSpeed: 100,
        category: "category_3",
        alertLevel: null,
        watchWarning: null,
    },
    {
        stormId: "nhc:EP082026",
        name: "HURRICANE HILDA",
        source: "nhc",
        basin: "eastern_north_pacific",
        lat: 15.8,
        lon: -109.2,
        datetime: "2026-08-08T12:00:00.000Z",
        windSpeed: 120,
        category: "category_4",
        alertLevel: null,
        watchWarning: null,
    },
    {
        stormId: "nhc:CP012026",
        name: "TROPICAL STORM IONA",
        source: "nhc",
        basin: "central_north_pacific",
        lat: 13.7,
        lon: -160.4,
        datetime: "2026-08-08T06:00:00.000Z",
        windSpeed: 50,
        category: null,
        alertLevel: null,
        watchWarning: null,
    },
    {
        stormId: "nhc:CP022026",
        name: "HURRICANE KELI",
        source: "nhc",
        basin: "central_north_pacific",
        lat: 17.2,
        lon: -171.6,
        datetime: "2026-08-08T12:00:00.000Z",
        windSpeed: 90,
        category: "category_2",
        alertLevel: null,
        watchWarning: "Tropical storm watch for Johnston Atoll.",
    },
    {
        stormId: "gdacs:TC:1001297:51",
        name: "DOLPHIN-26",
        source: "gdacs",
        basin: null,
        area: "Marshall Islands, Japan, China",
        lat: 27,
        lon: 124.8,
        datetime: "2026-08-08T12:00:00.000Z",
        windSpeed: 145,
        category: "category_5",
        alertLevel: "Orange",
        watchWarning: null,
    },
    {
        stormId: "gdacs:TC:1001432:3",
        name: "MANGKHUT-26",
        source: "gdacs",
        basin: null,
        area: "Philippines, Taiwan",
        lat: 18.3,
        lon: 121.4,
        datetime: "2026-08-08T09:00:00.000Z",
        windSpeed: 45,
        category: null,
        alertLevel: "Red",
        watchWarning: null,
    },
];

const TRACKS: Readonly<Record<string, StormTrack>> = Object.fromEntries(ACTIVE_STORMS.map((storm) => [
    storm.stormId,
    storm.source === "nhc" ? makeNhcTrack(storm) : makeGdacsTrack(storm),
]));

const CONES: Readonly<Record<string, StormCone>> = Object.fromEntries(ACTIVE_STORMS.map((storm) => [
    storm.stormId,
    storm.source === "nhc" ? makeNhcCone(storm) : makeGdacsCone(storm),
]));

const HISTORICAL_STORMS: Readonly<Record<string, { name: string; history: HistoricalStormTrack["history"] }>> = {
    "nhc:AL052025": makeHistoricalProfile("ERIN", 18.2, -43.6, "2025-08-15T00:00:00.000Z", 85, "category_1"),
    "nhc:AL092025": makeHistoricalProfile("IMELDA", 28.1, -77.9, "2025-09-30T00:00:00.000Z", 65, "category_1"),
    "nhc:AL132025": makeHistoricalProfile("MELISSA", 17.3, -61.4, "2025-10-28T00:00:00.000Z", 100, "category_3"),
    "nhc:EP012025": makeHistoricalProfile("ALVIN", 14.4, -108.7, "2025-05-31T00:00:00.000Z", 45, null),
    "nhc:EP032025": makeHistoricalProfile("EP032025", 15, -120, "2025-08-03T00:00:00.000Z", 65, "category_1"),
    "nhc:EP052025": makeHistoricalProfile("ERICK", 15.8, -104.1, "2025-06-19T00:00:00.000Z", 140, "category_5"),
    "nhc:CP012025": makeHistoricalProfile("IONA", 13.4, -158.1, "2025-08-01T00:00:00.000Z", 90, "category_2"),
    "nhc:CP022025": makeHistoricalProfile("KELI", 16.1, -167.5, "2025-08-18T00:00:00.000Z", 45, null),
};

function makeNhcTrack (storm: StormSummary): StormTrack {
    const windSpeed = storm.windSpeed ?? 35;

    return {
        stormId: storm.stormId,
        name: storm.name,
        source: "nhc",
        issuedAt: storm.datetime,
        cachedUntil: null,
        observed: [{
            lat: storm.lat,
            lon: storm.lon,
            datetime: storm.datetime,
            windSpeed,
            category: getCategory(windSpeed),
        }],
        forecast: [12, 24, 48].map((forecastHour) => ({
            lat: storm.lat + (forecastHour / 24),
            lon: storm.lon - (forecastHour / 6),
            datetime: new Date(Date.parse(storm.datetime) + (forecastHour * 3_600_000)).toISOString(),
            windSpeed: Math.max(35, windSpeed - (forecastHour / 6)),
            category: getCategory(Math.max(35, windSpeed - (forecastHour / 6))),
            forecastHour,
        })),
    };
}

function makeGdacsTrack (storm: StormSummary): StormTrack {
    const windSpeed = storm.windSpeed ?? 35;

    return {
        stormId: storm.stormId,
        name: storm.name,
        source: "gdacs",
        area: storm.area ?? null,
        issuedAt: storm.datetime,
        cachedUntil: null,
        observed: [{
            lat: storm.lat - 1.8,
            lon: storm.lon + 3.2,
            datetime: new Date(Date.parse(storm.datetime) - 24 * 3_600_000).toISOString(),
            windSpeed: Math.max(25, windSpeed - 20),
            category: getCategory(Math.max(25, windSpeed - 20)),
        }, {
            lat: storm.lat,
            lon: storm.lon,
            datetime: storm.datetime,
            windSpeed,
            category: getCategory(windSpeed),
        }],
        forecast: [],
    };
}

function makeNhcCone (storm: StormSummary): StormCone {
    return {
        stormId: storm.stormId,
        source: "nhc",
        issuedAt: storm.datetime,
        cachedUntil: null,
        availability: "available",
        geometryKind: "forecast_cone",
        geojson: {
            type: "Feature",
            properties: { source: "nhc", issuedAt: storm.datetime },
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [storm.lon - 2, storm.lat - 1],
                    [storm.lon + 3, storm.lat - 1],
                    [storm.lon + 6, storm.lat + 4],
                    [storm.lon - 2, storm.lat - 1],
                ]],
            },
        },
    };
}

function makeGdacsCone (storm: StormSummary): StormCone {
    return {
        stormId: storm.stormId,
        source: "gdacs",
        issuedAt: storm.datetime,
        cachedUntil: null,
        availability: "available",
        geometryKind: "gdacs_event_area",
        geojson: {
            type: "FeatureCollection",
            features: [{
                type: "Feature",
                properties: { source: "gdacs", area: storm.area ?? null },
                geometry: {
                    type: "Polygon",
                    coordinates: [[
                        [storm.lon - 4, storm.lat - 3],
                        [storm.lon + 4, storm.lat - 3],
                        [storm.lon + 4, storm.lat + 3],
                        [storm.lon - 4, storm.lat + 3],
                        [storm.lon - 4, storm.lat - 3],
                    ]],
                },
            }],
        },
    };
}

function makeHistoricalProfile (
    name: string,
    lat: number,
    lon: number,
    datetime: string,
    windSpeed: number,
    category: HistoricalStormTrack["history"][number]["category"],
): { name: string; history: HistoricalStormTrack["history"] } {
    return {
        name,
        history: [{
            lat: lat - 1.2,
            lon: lon + 2.4,
            datetime: new Date(Date.parse(datetime) - 12 * 3_600_000).toISOString(),
            windSpeed: Math.max(25, windSpeed - 20),
            category: getCategory(Math.max(25, windSpeed - 20)),
        }, {
            lat,
            lon,
            datetime,
            windSpeed,
            category,
        }],
    };
}

function getCategory (windSpeed: number): StormSummary["category"] {
    if (windSpeed >= 137) return "category_5";
    if (windSpeed >= 113) return "category_4";
    if (windSpeed >= 96) return "category_3";
    if (windSpeed >= 83) return "category_2";
    if (windSpeed >= 64) return "category_1";
    return null;
}

function cloneStormSummary (storm: StormSummary): StormSummary {
    return { ...storm };
}

function cloneStormTrack (track: StormTrack): StormTrack {
    return {
        ...track,
        observed: track.observed.map((point) => ({ ...point })),
        forecast: track.forecast.map((point) => ({ ...point })),
    };
}
