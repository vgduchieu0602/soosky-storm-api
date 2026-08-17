import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import AdmZip from "adm-zip";
import StormNotFoundError from "../src/domain/errors/StormNotFoundError.js";
import StormProviderError from "../src/domain/errors/StormProviderError.js";
import NhcStormRepository from "../src/adapters/nhc/NhcStormRepository.js";

const CURRENT_STORMS_URL = "https://example.test/CurrentStorms.json";
const TRACK_URL = "https://example.test/EP072026_031adv_TRACK.kmz";
const CONE_URL = "https://example.test/EP072026_031adv_CONE.kmz";

test("NHC storm repository normalizes active storms and a KMZ forecast track", async () => {
    const [currentStorms, kml] = await Promise.all([
        readFile(new URL("./fixtures/nhc/current-storms.json", import.meta.url), "utf-8"),
        readFile(new URL("./fixtures/nhc/forecast-track.kml", import.meta.url), "utf-8"),
    ]);
    const kmz = createKmz(kml);
    const repository = new NhcStormRepository(CURRENT_STORMS_URL, async (input) => {
        const url = String(input);

        if (url === CURRENT_STORMS_URL) {
            return new Response(currentStorms, { status: 200 });
        }

        if (url === TRACK_URL) {
            return new Response(kmz, { status: 200 });
        }

        return new Response(null, { status: 404 });
    });

    assert.deepEqual(await repository.getActiveStorms(), [
        {
            stormId: "nhc:EP072026",
            name: "Genevieve",
            source: "nhc",
            basin: "eastern_north_pacific",
            lat: 22.3,
            lon: -130.2,
            datetime: "2026-07-31T21:00:00.000Z",
            windSpeed: 50,
            category: null,
            alertLevel: null,
            watchWarning: "Storm surge watch/warning advisory 2026-07-31T21:00:00.000Z",
        },
    ]);

    assert.deepEqual(await repository.getStormTrack("nhc:EP072026"), {
        stormId: "nhc:EP072026",
        name: "Genevieve",
        source: "nhc",
        issuedAt: "2026-07-31T21:00:00.000Z",
        cachedUntil: null,
        observed: [
            {
                lat: 22.3,
                lon: -130.2,
                datetime: "2026-07-31T21:00:00.000Z",
                windSpeed: 50,
                category: null,
            },
        ],
        forecast: [
            {
                lat: 22.8,
                lon: -132.3,
                datetime: "2026-08-01T09:00:00.000Z",
                forecastHour: 12,
                windSpeed: 45,
                category: null,
            },
            {
                lat: 23.6,
                lon: -135.2,
                datetime: "2026-08-01T21:00:00.000Z",
                forecastHour: 24,
                windSpeed: 45,
                category: null,
            },
        ],
    });
});

test("NHC storm repository treats NHC's top-level empty array as no active storms", async () => {
    const repository = new NhcStormRepository(CURRENT_STORMS_URL, async () => {
        return new Response("[]", { status: 200 });
    });

    assert.deepEqual(await repository.getActiveStorms(), []);
});

test("NHC storm repository reports a storm that is not active", async () => {
    const repository = new NhcStormRepository(CURRENT_STORMS_URL, async () => {
        return new Response(JSON.stringify({ activeStorms: [] }), { status: 200 });
    });

    await assert.rejects(
        repository.getStormTrack("nhc:AL012026"),
        StormNotFoundError,
    );
});

test("NHC storm repository normalizes a forecast cone into GeoJSON", async () => {
    const [currentStorms, coneKml] = await Promise.all([
        readFile(new URL("./fixtures/nhc/current-storms.json", import.meta.url), "utf-8"),
        readFile(new URL("./fixtures/nhc/forecast-cone.kml", import.meta.url), "utf-8"),
    ]);
    const coneKmz = createKmz(coneKml);
    const repository = new NhcStormRepository(CURRENT_STORMS_URL, async (input) => {
        const url = String(input);

        if (url === CURRENT_STORMS_URL) {
            return new Response(currentStorms, { status: 200 });
        }

        if (url === CONE_URL) {
            return new Response(coneKmz, { status: 200 });
        }

        return new Response(null, { status: 404 });
    });

    assert.deepEqual(await repository.getStormCone("nhc:EP072026"), {
        stormId: "nhc:EP072026",
        source: "nhc",
        issuedAt: "2026-07-31T21:00:00.000Z",
        cachedUntil: null,
        availability: "available",
        geometryKind: "forecast_cone",
        geojson: {
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
    });
});

test("NHC storm repository reports unsupported and unavailable cone data", async () => {
    let calls = 0;
    const unsupported = new NhcStormRepository(CURRENT_STORMS_URL, async () => {
        calls += 1;
        return new Response(null, { status: 500 });
    });

    assert.deepEqual(await unsupported.getStormCone("nhc:WP012026"), {
        stormId: "nhc:WP012026",
        source: "nhc",
        issuedAt: null,
        cachedUntil: null,
        availability: "not_supported",
        geometryKind: null,
        reason: "NHC forecast cones are supported only for AL, EP, and CP basins.",
        geojson: null,
    });
    assert.equal(calls, 0);

    const unavailable = new NhcStormRepository(CURRENT_STORMS_URL, async () => {
        return new Response(JSON.stringify({
            activeStorms: [{
                id: "ep072026",
                name: "Genevieve",
                intensity: "50",
                latitudeNumeric: 22.3,
                longitudeNumeric: -130.2,
                lastUpdate: "2026-07-31T21:00:00.000Z",
                forecastTrack: {
                    issuance: "2026-07-31T21:00:00.000Z",
                    kmzFile: TRACK_URL,
                },
            }],
        }), { status: 200 });
    });

    assert.equal((await unavailable.getStormCone("nhc:EP072026")).availability, "not_available");
});

test("NHC storm repository reports an unavailable upstream source", async () => {
    const repository = new NhcStormRepository(CURRENT_STORMS_URL, async () => {
        return new Response(null, { status: 503 });
    });

    await assert.rejects(
        repository.getActiveStorms(),
        StormProviderError,
    );
});

function createKmz (kml: string): Buffer {
    const archive = new AdmZip();

    archive.addFile("forecast-track.kml", Buffer.from(kml, "utf-8"));

    return archive.toBuffer();
}
