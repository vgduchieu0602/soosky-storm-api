import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gzipSync } from "node:zlib";
import AdmZip from "adm-zip";
import StormNotFoundError from "../src/domain/errors/StormNotFoundError.js";
import StormProviderError from "../src/domain/errors/StormProviderError.js";
import NhcHistoricalStormTrackRepository from "../src/adapters/nhc/NhcHistoricalStormTrackRepository.js";

const CURRENT_STORMS_URL = "https://example.test/CurrentStorms.json";
const BEST_TRACK_KMZ_URL = "https://example.test/EP072026_best_track.kmz";
const BEST_TRACK_KML_URL = "https://example.test/EP072026_best_track.kml";
const ARCHIVE_URL = "https://example.test/archive";

test("NHC historical track repository downloads KMZ best-track data and normalizes history chronologically", async () => {
    const [currentStorms, bestTrackKml] = await Promise.all([
        readFile(new URL("./fixtures/nhc/current-storms-history.json", import.meta.url), "utf-8"),
        readFile(new URL("./fixtures/nhc/best-track.kml", import.meta.url), "utf-8"),
    ]);
    const repository = new NhcHistoricalStormTrackRepository(CURRENT_STORMS_URL, async (input) => {
        switch (String(input)) {
            case CURRENT_STORMS_URL:
                return new Response(currentStorms, { status: 200 });
            case BEST_TRACK_KMZ_URL:
                return new Response(createKmz(bestTrackKml), { status: 200 });
            default:
                return new Response(null, { status: 404 });
        }
    });

    assert.deepEqual(await repository.getHistoricalStormTrack("nhc:EP072026"), {
        stormId: "nhc:EP072026",
        name: "Genevieve",
        source: "nhc",
        trackKind: "best_track",
        cachedUntil: null,
        availability: "available",
        history: [
            { lat: 21.4, lon: -128.2, datetime: "2026-07-31T06:00:00.000Z", windSpeed: 50, category: null },
            { lat: 21.8, lon: -129.1, datetime: "2026-07-31T12:00:00.000Z", windSpeed: 70, category: "category_1" },
            { lat: 22.1, lon: -129.9, datetime: "2026-07-31T18:00:00.000Z", windSpeed: 90, category: "category_2" },
        ],
    });
});

test("NHC historical track repository accepts a KML best-track asset", async () => {
    const [currentStorms, bestTrackKml] = await Promise.all([
        readFile(new URL("./fixtures/nhc/current-storms-history.json", import.meta.url), "utf-8"),
        readFile(new URL("./fixtures/nhc/best-track.kml", import.meta.url), "utf-8"),
    ]);
    const repository = new NhcHistoricalStormTrackRepository(CURRENT_STORMS_URL, async (input) => {
        const url = String(input);

        if (url === CURRENT_STORMS_URL) {
            return new Response(currentStorms.replace(BEST_TRACK_KMZ_URL, BEST_TRACK_KML_URL), { status: 200 });
        }

        return new Response(bestTrackKml, { status: 200 });
    });

    assert.equal((await repository.getHistoricalStormTrack("nhc:EP072026")).history.length, 3);
});

test("NHC historical track repository reports an active storm without a best-track asset as unavailable", async () => {
    const repository = new NhcHistoricalStormTrackRepository(CURRENT_STORMS_URL, async () => {
        return new Response(JSON.stringify({
            activeStorms: [{
                id: "ep072026",
                name: "Genevieve",
                intensity: "50",
                latitudeNumeric: 22.3,
                longitudeNumeric: -130.2,
                lastUpdate: "2026-07-31T21:00:00.000Z",
                forecastTrack: { issuance: "2026-07-31T21:00:00.000Z", kmzFile: "https://example.test/track.kmz" },
            }],
        }), { status: 200 });
    });

    assert.deepEqual(await repository.getHistoricalStormTrack("nhc:EP072026"), {
        stormId: "nhc:EP072026",
        name: "Genevieve",
        source: "nhc",
        trackKind: null,
        cachedUntil: null,
        availability: "not_available",
        reason: "NHC has not published a best track for this storm.",
        history: [],
    });
});

test("NHC historical track repository reports a storm that is not active", async () => {
    const repository = new NhcHistoricalStormTrackRepository(CURRENT_STORMS_URL, async () => {
        return new Response(JSON.stringify({ activeStorms: [] }), { status: 200 });
    });

    await assert.rejects(repository.getHistoricalStormTrack("nhc:AL012026"), StormNotFoundError);
});

test("NHC historical track repository reads an archived B-deck for a finished storm", async () => {
    const repository = new NhcHistoricalStormTrackRepository(CURRENT_STORMS_URL, async (input) => {
        const url = String(input);

        if (url === CURRENT_STORMS_URL) {
            return new Response(JSON.stringify({ activeStorms: [] }), { status: 200 });
        }

        if (url === ARCHIVE_URL + "/2025/bep072025.dat.gz") {
            return new Response(gzipSync(Buffer.from([
                "EP, 07, 2025073106, BEST, 0, 214N, 1282W, 50, 1000",
                "EP, 07, 2025073112, BEST, 0, 218N, 1291W, 70, 990",
                "EP, 07, 2025073118, BEST, 0, 221N, 1299W, 90, 975",
            ].join("\n"))), { status: 200 });
        }

        return new Response(null, { status: 404 });
    }, ARCHIVE_URL);

    assert.deepEqual(await repository.getHistoricalStormTrack("nhc:EP072025"), {
        stormId: "nhc:EP072025",
        name: "EP072025",
        source: "nhc",
        trackKind: "best_track",
        cachedUntil: null,
        availability: "available",
        history: [
            { lat: 21.4, lon: -128.2, datetime: "2025-07-31T06:00:00.000Z", windSpeed: 50, category: null },
            { lat: 21.8, lon: -129.1, datetime: "2025-07-31T12:00:00.000Z", windSpeed: 70, category: "category_1" },
            { lat: 22.1, lon: -129.9, datetime: "2025-07-31T18:00:00.000Z", windSpeed: 90, category: "category_2" },
        ],
    });
});

test("NHC historical track repository treats NHC's top-level empty array as no active storms", async () => {
    const repository = new NhcHistoricalStormTrackRepository(CURRENT_STORMS_URL, async () => {
        return new Response("[]", { status: 200 });
    });

    await assert.rejects(repository.getHistoricalStormTrack("nhc:AL012026"), StormNotFoundError);
});

test("NHC historical track repository maps invalid KML and NHC source failures to provider errors", async (context) => {
    await context.test("invalid KML", async () => {
        const repository = new NhcHistoricalStormTrackRepository(CURRENT_STORMS_URL, async (input) => {
            if (String(input) === CURRENT_STORMS_URL) {
                return new Response(JSON.stringify({ activeStorms: [activeStorm()] }), { status: 200 });
            }

            return new Response("<kml><Placemark /></kml>", { status: 200 });
        });

        await assert.rejects(repository.getHistoricalStormTrack("nhc:EP072026"), StormProviderError);
    });

    await context.test("HTTP failure", async () => {
        const repository = new NhcHistoricalStormTrackRepository(CURRENT_STORMS_URL, async () => {
            return new Response(null, { status: 503 });
        });

        await assert.rejects(repository.getHistoricalStormTrack("nhc:EP072026"), StormProviderError);
    });

    await context.test("network failure", async () => {
        const repository = new NhcHistoricalStormTrackRepository(CURRENT_STORMS_URL, async () => {
            throw new Error("network unavailable");
        });

        await assert.rejects(repository.getHistoricalStormTrack("nhc:EP072026"), StormProviderError);
    });
});

function activeStorm (): Record<string, unknown> {
    return {
        id: "ep072026",
        name: "Genevieve",
        intensity: "50",
        latitudeNumeric: 22.3,
        longitudeNumeric: -130.2,
        lastUpdate: "2026-07-31T21:00:00.000Z",
        forecastTrack: { issuance: "2026-07-31T21:00:00.000Z", kmzFile: "https://example.test/track.kmz" },
        bestTrackGIS: { kmzFile: BEST_TRACK_KML_URL },
    };
}

function createKmz (kml: string): Buffer {
    const archive = new AdmZip();

    archive.addFile("best-track.kml", Buffer.from(kml, "utf-8"));

    return archive.toBuffer();
}
