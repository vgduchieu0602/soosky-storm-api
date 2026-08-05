import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import parseNhcForecastTrackKml from "../src/adapters/nhc/parseNhcForecastTrackKml.js";

test("parses NHC forecast KML placemarks into forecast points", async () => {
    const fixture = await readFile(
        new URL("./fixtures/nhc/forecast-track.kml", import.meta.url),
        "utf-8",
    );

    const points = parseNhcForecastTrackKml(
        fixture,
        "2026-07-31T21:00:00.000Z",
    );

    assert.deepEqual(points, [
        {
            lat: 22.8,
            lon: -132.3,
            datetime: "2026-08-01T09:00:00.000Z",
            forecastHour: 12,
            windSpeed: 45,
            category: "tropical_storm",
        },
        {
            lat: 23.6,
            lon: -135.2,
            datetime: "2026-08-01T21:00:00.000Z",
            forecastHour: 24,
            windSpeed: 45,
            category: "tropical_storm",
        },
    ]);
});
