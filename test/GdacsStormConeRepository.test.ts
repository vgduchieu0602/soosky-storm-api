import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import GdacsStormConeRepository from "../src/adapters/gdacs/GdacsStormConeRepository.js";
import StormProviderError from "../src/domain/errors/StormProviderError.js";

const GEOMETRY_URL = "https://example.test/gdacs/geometry";

test("GDACS cone repository preserves a tropical cyclone FeatureCollection", async () => {
    const fixture = JSON.parse(await readFile(new URL("./fixtures/gdacs/tc-geometry.json", import.meta.url), "utf-8"));
    let requestedUrl = "";
    const repository = new GdacsStormConeRepository(GEOMETRY_URL, async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify(fixture), { status: 200 });
    });

    assert.deepEqual(await repository.getStormCone("gdacs:TC:1001298:2"), {
        stormId: "gdacs:TC:1001298:2",
        source: "gdacs",
        issuedAt: null,
        cachedUntil: null,
        availability: "available",
        geometryKind: "gdacs_event_area",
        geojson: fixture,
    });
    assert.equal(requestedUrl, GEOMETRY_URL + "?eventtype=TC&eventid=1001298&episodeid=2");
});

test("GDACS cone repository reports an empty FeatureCollection as unavailable", async () => {
    const repository = new GdacsStormConeRepository(GEOMETRY_URL, async () => {
        return new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), { status: 200 });
    });

    assert.deepEqual(await repository.getStormCone("gdacs:TC:1001298:2"), {
        stormId: "gdacs:TC:1001298:2",
        source: "gdacs",
        issuedAt: null,
        cachedUntil: null,
        availability: "not_available",
        geometryKind: null,
        reason: "GDACS has not published geometry for this storm event.",
        geojson: null,
    });
});

test("GDACS cone repository rejects an invalid geometry response", async () => {
    const repository = new GdacsStormConeRepository(GEOMETRY_URL, async () => {
        return new Response(JSON.stringify({ type: "Feature", geometry: null }), { status: 200 });
    });

    await assert.rejects(
        repository.getStormCone("gdacs:TC:1001298:2"),
        StormProviderError,
    );
});

test("GDACS cone repository maps an upstream failure to a provider error", async () => {
    const repository = new GdacsStormConeRepository(GEOMETRY_URL, async () => {
        return new Response(null, { status: 503 });
    });

    await assert.rejects(
        repository.getStormCone("gdacs:TC:1001298:2"),
        StormProviderError,
    );
});
