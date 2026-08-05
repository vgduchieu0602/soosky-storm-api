import assert from "node:assert/strict";
import test from "node:test";
import RainViewerRadarRepository from "../src/adapters/rainviewer/RainViewerRadarRepository.js";
import StormProviderError from "../src/domain/errors/StormProviderError.js";

test("RainViewer radar repository normalizes a radar manifest for the frontend", async () => {
    const repository = new RainViewerRadarRepository(async () => Response.json({
        host: "https://tilecache.rainviewer.com",
        generated: 1785888000,
        radar: {
            past: [{ time: 1785887700, path: "/v2/radar/1785887700" }],
            nowcast: [{ time: 1785888000, path: "/v2/radar/1785888000" }],
        },
    }));

    assert.deepEqual(await repository.getRadar(), {
        source: "rainviewer",
        attribution: "Weather data by RainViewer",
        attributionUrl: "https://www.rainviewer.com/",
        host: "https://tilecache.rainviewer.com",
        tileTemplate: "https://tilecache.rainviewer.com{path}/256/{z}/{x}/{y}/2/1_1.png",
        past: [{ time: "2026-08-04T23:55:00.000Z", path: "/v2/radar/1785887700" }],
        nowcast: [{ time: "2026-08-05T00:00:00.000Z", path: "/v2/radar/1785888000" }],
        generatedAt: "2026-08-05T00:00:00.000Z",
        cachedUntil: null,
    });
});

test("RainViewer radar repository maps HTTP, JSON, and invalid manifest data to provider errors", async () => {
    const httpFailure = new RainViewerRadarRepository(async () => new Response(null, { status: 500 }));
    const invalidJson = new RainViewerRadarRepository(async () => ({
        ok: true,
        json: async () => Promise.reject(new Error("invalid JSON")),
    }) as Response);
    const missingHost = new RainViewerRadarRepository(async () => Response.json({
        generated: 1785888000,
        radar: { past: [], nowcast: [] },
    }));
    const invalidFrame = new RainViewerRadarRepository(async () => Response.json({
        host: "https://tilecache.rainviewer.com",
        generated: 1785888000,
        radar: { past: [{ time: 1785887700, path: "invalid" }], nowcast: [] },
    }));

    await assert.rejects(httpFailure.getRadar(), StormProviderError);
    await assert.rejects(invalidJson.getRadar(), StormProviderError);
    await assert.rejects(missingHost.getRadar(), StormProviderError);
    await assert.rejects(invalidFrame.getRadar(), StormProviderError);
});

test("RainViewer radar repository accepts a manifest without optional nowcast frames", async () => {
    const repository = new RainViewerRadarRepository(async () => Response.json({
        host: "https://tilecache.rainviewer.com",
        generated: 1785888000,
        radar: { past: [] },
    }));

    assert.deepEqual((await repository.getRadar()).nowcast, []);
});
