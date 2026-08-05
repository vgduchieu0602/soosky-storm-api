import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import StormProviderError from "../src/domain/errors/StormProviderError.js";
import parseNhcForecastConeKml from "../src/adapters/nhc/parseNhcForecastConeKml.js";

test("parses an NHC KML cone polygon into GeoJSON", async () => {
    const kml = await readFile(
        new URL("./fixtures/nhc/forecast-cone.kml", import.meta.url),
        "utf-8",
    );

    assert.deepEqual(
        parseNhcForecastConeKml(kml, "2026-07-31T21:00:00.000Z"),
        {
            type: "Feature",
            properties: {
                source: "nhc",
                issuedAt: "2026-07-31T21:00:00.000Z",
            },
            geometry: {
                type: "Polygon",
                coordinates: [[
                    [-132.3, 22.8],
                    [-135.2, 23.6],
                    [-136, 23],
                    [-132.3, 22.8],
                ]],
            },
        },
    );
});

test("rejects a cone KML without a valid polygon", () => {
    assert.throws(
        () => parseNhcForecastConeKml("<kml><Document /></kml>", "2026-07-31T21:00:00.000Z"),
        StormProviderError,
    );
    assert.throws(
        () => parseNhcForecastConeKml(
            "<kml><Polygon><outerBoundaryIs><LinearRing><coordinates>190,22,0 2,3,0 4,5,0</coordinates></LinearRing></outerBoundaryIs></Polygon></kml>",
            "2026-07-31T21:00:00.000Z",
        ),
        StormProviderError,
    );
});
