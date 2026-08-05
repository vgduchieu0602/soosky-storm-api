import assert from "node:assert/strict";
import test from "node:test";
import CachedStormRepository from "../src/adapters/cache/CachedStormRepository.js";
import CompositeStormRepository from "../src/adapters/storm/CompositeStormRepository.js";
import StormCone from "../src/domain/entities/StormCone.js";
import StormSummary from "../src/domain/entities/StormSummary.js";
import StormTrack from "../src/domain/entities/StormTrack.js";
import StormConeRepository from "../src/domain/repositories/IStormConeRepository.js";
import StormRepository from "../src/domain/repositories/IStormRepository.js";

test("Composite storm repository sends GDACS cone requests to GDACS only", async () => {
    const nhc = new CountingNhcStormRepository();
    const gdacs = new CountingGdacsStormConeRepository();
    const repository = new CompositeStormRepository(nhc, gdacs);

    assert.equal((await repository.getStormCone("nhc:EP072026")).source, "nhc");
    assert.equal((await repository.getStormCone("gdacs:TC:1001298:2")).source, "gdacs");

    assert.equal(nhc.coneCalls, 1);
    assert.equal(gdacs.coneCalls, 1);
});

test("Composite storm repository keeps active storms and track data on NHC", async () => {
    const nhc = new CountingNhcStormRepository();
    const gdacs = new CountingGdacsStormConeRepository();
    const repository = new CompositeStormRepository(nhc, gdacs);

    await repository.getActiveStorms();
    await repository.getStormTrack("nhc:EP072026");

    assert.equal(nhc.listCalls, 1);
    assert.equal(nhc.trackCalls, 1);
    assert.equal(gdacs.coneCalls, 0);
});

test("Cached composite repository caches GDACS geometry for two hours only when available", async () => {
    const gdacs = new CountingGdacsStormConeRepository();
    let now = Date.parse("2026-08-05T00:00:00.000Z");
    const repository = new CachedStormRepository(
        new CompositeStormRepository(new CountingNhcStormRepository(), gdacs),
        7_200_000,
        () => now,
    );

    const first = await repository.getStormCone("gdacs:TC:1001298:2");
    const second = await repository.getStormCone("gdacs:TC:1001298:2");

    assert.equal(gdacs.coneCalls, 1);
    assert.equal(first.cachedUntil, "2026-08-05T02:00:00.000Z");
    assert.equal(second.cachedUntil, "2026-08-05T02:00:00.000Z");

    gdacs.available = false;
    now = Date.parse("2026-08-05T02:00:00.000Z");

    const unavailableFirst = await repository.getStormCone("gdacs:TC:1001298:2");
    const unavailableSecond = await repository.getStormCone("gdacs:TC:1001298:2");

    assert.equal(unavailableFirst.availability, "not_available");
    assert.equal(unavailableSecond.availability, "not_available");
    assert.equal(gdacs.coneCalls, 3);
});

class CountingNhcStormRepository implements StormRepository {
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
            name: "NHC storm",
            source: "nhc",
            issuedAt: "2026-08-05T00:00:00.000Z",
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
                properties: {},
                geometry: {
                    type: "Polygon",
                    coordinates: [],
                },
            },
        };
    }
}

class CountingGdacsStormConeRepository implements StormConeRepository {
    public coneCalls = 0;
    public available = true;

    public async getStormCone (stormId: string): Promise<StormCone> {
        this.coneCalls += 1;

        if (!this.available) {
            return {
                stormId,
                source: "gdacs",
                issuedAt: null,
                cachedUntil: null,
                availability: "not_available",
                geometryKind: null,
                reason: "GDACS has not published geometry for this storm event.",
                geojson: null,
            };
        }

        return {
            stormId,
            source: "gdacs",
            issuedAt: null,
            cachedUntil: null,
            availability: "available",
            geometryKind: "gdacs_event_area",
            geojson: {
                type: "FeatureCollection",
                features: [],
            },
        };
    }
}
