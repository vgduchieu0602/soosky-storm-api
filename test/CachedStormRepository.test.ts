import assert from "node:assert/strict";
import test from "node:test";
import StormSummary from "../src/domain/entities/StormSummary.js";
import StormCone from "../src/domain/entities/StormCone.js";
import StormTrack from "../src/domain/entities/StormTrack.js";
import StormRepository from "../src/domain/repositories/IStormRepository.js";
import CachedStormRepository from "../src/adapters/cache/CachedStormRepository.js";

test("Storm Track cache reuses a normalized track until the two-hour TTL expires", async () => {
    const source = new CountingStormRepository();
    let now = Date.parse("2026-08-04T00:00:00.000Z");
    const repository = new CachedStormRepository(
        source,
        7_200_000,
        () => now,
    );

    const first = await repository.getStormTrack("nhc:EP072026");
    const second = await repository.getStormTrack("nhc:EP072026");

    assert.equal(source.trackCalls, 1);
    assert.equal(first.cachedUntil, "2026-08-04T02:00:00.000Z");
    assert.equal(second.cachedUntil, "2026-08-04T02:00:00.000Z");

    now = Date.parse("2026-08-04T02:00:00.000Z");
    const refreshed = await repository.getStormTrack("nhc:EP072026");

    assert.equal(source.trackCalls, 2);
    assert.equal(refreshed.cachedUntil, "2026-08-04T04:00:00.000Z");
});

test("Storm List cache reuses an active-storm list for one hour, including an empty list", async () => {
    const source = new CountingStormRepository();
    let now = Date.parse("2026-08-05T00:00:00.000Z");
    const repository = new CachedStormRepository(source, 7_200_000, () => now);

    await repository.getActiveStorms();
    await repository.getActiveStorms();

    assert.equal(source.listCalls, 1);

    now = Date.parse("2026-08-05T00:59:59.000Z");
    await repository.getActiveStorms();

    assert.equal(source.listCalls, 1);

    now = Date.parse("2026-08-05T01:00:00.000Z");
    await repository.getActiveStorms();

    assert.equal(source.listCalls, 2);
});

test("Storm Cone cache reuses an available cone until the two-hour TTL expires", async () => {
    const source = new CountingStormRepository();
    let now = Date.parse("2026-08-05T00:00:00.000Z");
    const repository = new CachedStormRepository(
        source,
        7_200_000,
        () => now,
    );

    const first = await repository.getStormCone("nhc:EP072026");
    const second = await repository.getStormCone("nhc:EP072026");

    assert.equal(source.coneCalls, 1);
    assert.equal(first.cachedUntil, "2026-08-05T02:00:00.000Z");
    assert.equal(second.cachedUntil, "2026-08-05T02:00:00.000Z");

    now = Date.parse("2026-08-05T02:00:00.000Z");
    const refreshed = await repository.getStormCone("nhc:EP072026");

    assert.equal(source.coneCalls, 2);
    assert.equal(refreshed.cachedUntil, "2026-08-05T04:00:00.000Z");
});

test("Storm caches refresh an older track and do not retain a cone larger than its byte budget", async () => {
    const source = new CountingStormRepository();
    const repository = new CachedStormRepository(source, 7_200_000, Date.now, {
        track: { maxEntries: 1, maxBytes: 10_000 },
        cone: { maxEntries: 1, maxBytes: 1 },
    });

    await repository.getStormTrack("nhc:EP072026");
    await repository.getStormTrack("nhc:EP082026");
    await repository.getStormTrack("nhc:EP072026");
    assert.equal(source.trackCalls, 3);

    await repository.getStormCone("nhc:EP072026");
    await repository.getStormCone("nhc:EP072026");
    assert.equal(source.coneCalls, 2);
});

class CountingStormRepository implements StormRepository {
    public listCalls = 0;
    public trackCalls = 0;
    public coneCalls = 0;

    public async getActiveStorms (): Promise<StormSummary[]> {
        this.listCalls += 1;

        return [];
    }

    public async getStormTrack (stormId: string): Promise<StormTrack> {
        this.trackCalls += 1;

        return {
            stormId,
            name: "Genevieve",
            source: "nhc",
            issuedAt: "2026-08-04T00:00:00.000Z",
            cachedUntil: null,
            observed: [],
            forecast: [],
        };
    }

    public async getStormCone (stormId: string): Promise<StormCone> {
        this.coneCalls += 1;

        return {
            stormId,
            source: "nhc",
            issuedAt: "2026-08-05T00:00:00.000Z",
            cachedUntil: null,
            availability: "available",
            geometryKind: "forecast_cone",
            geojson: {
                type: "Feature",
                properties: {
                    source: "nhc",
                    issuedAt: "2026-08-05T00:00:00.000Z",
                },
                geometry: {
                    type: "Polygon",
                    coordinates: [[[-130, 20], [-131, 21], [-132, 20], [-130, 20]]],
                },
            },
        };
    }
}
