import assert from "node:assert/strict";
import test from "node:test";
import StormSummary from "../src/domain/entities/storm/StormSummary.js";
import StormCone from "../src/domain/entities/storm/StormCone.js";
import StormTrack from "../src/domain/entities/storm/StormTrack.js";
import StormProviderError from "../src/domain/errors/StormProviderError.js";
import StormRepository from "../src/domain/repositories/storm/IStormRepository.js";
import CachedStormRepository from "../src/adapters/cache/CachedStormRepository.js";
import { getCacheStatus } from "../src/domain/services/cacheStatus.js";

test("Storm Track cache reuses a normalized track until the two-hour TTL expires", async () => {
    const source = new CountingStormRepository();
    let now = Date.parse("2026-08-04T00:00:00.000Z");
    const repository = new CachedStormRepository(
        source,
        7_200_000,
        3_600_000,
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

test("Storm List cache returns fresh data without calling the provider, including for an empty list", async () => {
    const source = new CountingStormRepository();
    let now = Date.parse("2026-08-05T00:00:00.000Z");
    const repository = new CachedStormRepository(source, 7_200_000, 3_600_000, () => now);

    const first = await repository.getActiveStorms();
    const second = await repository.getActiveStorms();

    assert.equal(source.listCalls, 1);
    assert.equal(getCacheStatus(first), "upstream");
    assert.equal(getCacheStatus(second), "cached");

    now = Date.parse("2026-08-05T00:59:59.000Z");
    await repository.getActiveStorms();

    assert.equal(source.listCalls, 1);

    now = Date.parse("2026-08-05T01:00:00.000Z");
    await repository.getActiveStorms();

    assert.equal(source.listCalls, 2);
});

test("Storm List cache refreshes expired data when the provider succeeds", async () => {
    const source = new CountingStormRepository([[stormSummary("old")], [stormSummary("new")]]);
    let now = Date.parse("2026-08-05T00:00:00.000Z");
    const repository = new CachedStormRepository(source, 7_200_000, 3_600_000, () => now);

    assert.deepEqual(await repository.getActiveStorms(), [stormSummary("old")]);

    now += 3_600_000;
    const refreshed = await repository.getActiveStorms();

    assert.deepEqual(refreshed, [stormSummary("new")]);
    assert.equal(getCacheStatus(refreshed), "upstream");
    assert.equal(source.listCalls, 2);

    const fresh = await repository.getActiveStorms();
    assert.deepEqual(fresh, [stormSummary("new")]);
    assert.equal(getCacheStatus(fresh), "cached");
    assert.equal(source.listCalls, 2);
});

test("Storm List cache returns stale data when an expired refresh has an upstream failure", async () => {
    const source = new CountingStormRepository([[stormSummary("old")]]);
    let now = Date.parse("2026-08-05T00:00:00.000Z");
    const repository = new CachedStormRepository(source, 7_200_000, 3_600_000, () => now);

    await repository.getActiveStorms();
    now += 3_600_000;
    source.listError = new StormProviderError("NHC list failed.");

    const stale = await repository.getActiveStorms();

    assert.deepEqual(stale, [stormSummary("old")]);
    assert.equal(getCacheStatus(stale), "stale");
    assert.equal(source.listCalls, 2);
});

test("Storm List cache propagates an upstream failure when no cached value exists", async () => {
    const source = new CountingStormRepository();
    const repository = new CachedStormRepository(source, 7_200_000, 3_600_000);
    source.listError = new StormProviderError("NHC list failed.");

    await assert.rejects(repository.getActiveStorms(), StormProviderError);
    assert.equal(source.listCalls, 1);
});

test("Storm List cache replaces stale data when the provider recovers", async () => {
    const source = new CountingStormRepository([[stormSummary("old")], [stormSummary("new")]]);
    let now = Date.parse("2026-08-05T00:00:00.000Z");
    const repository = new CachedStormRepository(source, 7_200_000, 3_600_000, () => now);

    await repository.getActiveStorms();
    now += 3_600_000;
    source.listError = new StormProviderError("NHC list failed.");
    assert.equal(getCacheStatus(await repository.getActiveStorms()), "stale");

    source.listError = null;
    const recovered = await repository.getActiveStorms();

    assert.deepEqual(recovered, [stormSummary("new")]);
    assert.equal(getCacheStatus(recovered), "upstream");
    assert.equal(source.listCalls, 3);
});

test("Storm List cache does not hide unexpected errors behind stale data", async () => {
    const source = new CountingStormRepository([[stormSummary("old")]]);
    let now = Date.parse("2026-08-05T00:00:00.000Z");
    const repository = new CachedStormRepository(source, 7_200_000, 3_600_000, () => now);

    await repository.getActiveStorms();
    now += 3_600_000;
    source.listError = new TypeError("Unexpected malformed response.");

    await assert.rejects(repository.getActiveStorms(), TypeError);
    assert.equal(source.listCalls, 2);
});

test("Storm List cache keeps provider-specific results separate from the all-provider result", async () => {
    const source = new CountingStormRepository();
    const repository = new CachedStormRepository(source, 7_200_000, 3_600_000);

    await repository.getActiveStorms();
    await repository.getActiveStorms("nhc");
    await repository.getActiveStorms("nhc");
    await repository.getActiveStorms("gdacs");

    assert.deepEqual(source.listSources, [undefined, "nhc", "gdacs"]);
});

test("Storm Cone cache reuses an available cone until the two-hour TTL expires", async () => {
    const source = new CountingStormRepository();
    let now = Date.parse("2026-08-05T00:00:00.000Z");
    const repository = new CachedStormRepository(
        source,
        7_200_000,
        3_600_000,
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
    const repository = new CachedStormRepository(source, 7_200_000, 3_600_000, Date.now, {
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
    public readonly listSources: (StormSummary["source"] | undefined)[] = [];
    public listError: Error | null = null;
    public trackCalls = 0;
    public coneCalls = 0;

    public constructor (private readonly _listResponses: StormSummary[][] = [[]]) {}

    public async getActiveStorms (source?: StormSummary["source"]): Promise<StormSummary[]> {
        this.listCalls += 1;
        this.listSources.push(source);

        if (this.listError) {
            throw this.listError;
        }

        return this._listResponses[Math.min(this.listCalls - 1, this._listResponses.length - 1)]!;
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

function stormSummary (name: string): StormSummary {
    return {
        stormId: "nhc:EP072026",
        name,
        source: "nhc",
        basin: "eastern_north_pacific",
        lat: 22.3,
        lon: -130.2,
        datetime: "2026-08-05T00:00:00.000Z",
        windSpeed: 50,
        category: null,
    };
}
