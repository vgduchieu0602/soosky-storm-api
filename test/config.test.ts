import assert from "node:assert/strict";
import test from "node:test";

const CACHE_TTL_KEYS = [
    "NHC_CACHE_TTL_MS",
    "ACTIVE_STORMS_CACHE_TTL_MS",
    "HISTORICAL_STORM_TRACK_CACHE_TTL_MS",
    "FORECAST_WEATHER_CACHE_TTL_MS",
    "CURRENT_WEATHER_CACHE_TTL_MS",
    "MAP_TILE_CACHE_TTL_MS",
    "RADAR_CACHE_TTL_MS",
] as const;

test("storm data mode uses live providers by default and accepts the fixture override", async () => {
    const previousValue = process.env.STORM_DATA_MODE;

    try {
        process.env.STORM_DATA_MODE = "";
        const { default: liveConfig } = await import("../src/config.ts?storm-data-mode-live");

        process.env.STORM_DATA_MODE = "fixture";
        const { default: fixtureConfig } = await import("../src/config.ts?storm-data-mode-fixture");

        assert.equal(liveConfig.stormDataMode, "live");
        assert.equal(fixtureConfig.stormDataMode, "fixture");
    } finally {
        if (previousValue === undefined) {
            delete process.env.STORM_DATA_MODE;
        } else {
            process.env.STORM_DATA_MODE = previousValue;
        }
    }
});

test("cache TTLs default to production values when the environment does not override them", async () => {
    const previousValues = new Map(CACHE_TTL_KEYS.map((key) => [key, process.env[key]]));

    try {
        for (const key of CACHE_TTL_KEYS) {
            process.env[key] = "";
        }

        const { default: config } = await import("../src/config.ts?production-cache-defaults");

        assert.deepEqual(config.cache, {
            stormTtlMs: 7_200_000,
            activeStormsTtlMs: 3_600_000,
            historicalStormTrackTtlMs: 7_200_000,
            forecastWeatherTtlMs: 86_400_000,
            currentWeatherTtlMs: 600_000,
            mapTileTtlMs: 43_200_000,
            radarTtlMs: 43_200_000,
        });
    } finally {
        for (const [key, value] of previousValues) {
            if (value === undefined) {
                delete process.env[key];
                continue;
            }

            process.env[key] = value;
        }
    }
});
