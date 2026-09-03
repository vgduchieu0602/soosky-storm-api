import assert from "node:assert/strict";
import test from "node:test";
import CachedStormRepository from "../src/adapters/cache/CachedStormRepository.js";
import CompositeHistoricalStormTrackRepository from "../src/adapters/storm/CompositeHistoricalStormTrackRepository.js";
import CompositeStormRepository from "../src/adapters/storm/CompositeStormRepository.js";
import HistoricalStormTrack from "../src/domain/entities/storm/HistoricalStormTrack.js";
import StormCone from "../src/domain/entities/storm/StormCone.js";
import StormSummary from "../src/domain/entities/storm/StormSummary.js";
import StormTrack from "../src/domain/entities/storm/StormTrack.js";
import StormProviderError from "../src/domain/errors/StormProviderError.js";
import ActiveStormsRepository from "../src/domain/repositories/storm/IActiveStormsRepository.js";
import HistoricalStormTrackRepository from "../src/domain/repositories/storm/IHistoricalStormTrackRepository.js";
import StormConeRepository from "../src/domain/repositories/storm/IStormConeRepository.js";
import StormRepository from "../src/domain/repositories/storm/IStormRepository.js";
import StormTrackRepository from "../src/domain/repositories/storm/IStormTrackRepository.js";

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

test("Composite storm repository merges NHC and GDACS active storms", async () => {
    const nhc = new CountingNhcStormRepository([nhcSummary()]);
    const gdacsStorms = new CountingGdacsStormRepository([gdacsSummary()]);
    const repository = new CompositeStormRepository(nhc, new CountingGdacsStormConeRepository(), gdacsStorms);

    assert.deepEqual(
        (await repository.getActiveStorms()).map((storm) => storm.stormId),
        ["nhc:EP072026", "gdacs:TC:1001297:51"],
    );
    assert.equal(nhc.listCalls, 1);
    assert.equal(gdacsStorms.listCalls, 1);
});

test("Composite storm repository returns the requested NHC provider result, including an empty result", async () => {
    const nhc = new CountingNhcStormRepository([nhcSummary()]);
    const gdacsStorms = new CountingGdacsStormRepository([gdacsSummary()]);
    const repository = new CompositeStormRepository(nhc, new CountingGdacsStormConeRepository(), gdacsStorms);

    assert.deepEqual(await repository.getActiveStorms("nhc"), [nhcSummary()]);

    const emptyNhc = new CountingNhcStormRepository([]);
    const emptyRepository = new CompositeStormRepository(
        emptyNhc,
        new CountingGdacsStormConeRepository(),
        gdacsStorms,
    );

    assert.deepEqual(await emptyRepository.getActiveStorms("nhc"), []);
    assert.equal(gdacsStorms.listCalls, 0);
});

test("Composite storm repository fails a requested provider even when the other provider succeeds", async () => {
    const nhc = new CountingNhcStormRepository([nhcSummary()]);
    const gdacsStorms = new CountingGdacsStormRepository([gdacsSummary()]);
    const repository = new CompositeStormRepository(nhc, new CountingGdacsStormConeRepository(), gdacsStorms);

    nhc.listError = new StormProviderError("NHC list failed.");
    await assert.rejects(repository.getActiveStorms("nhc"), StormProviderError);
    assert.equal(gdacsStorms.listCalls, 0);

    nhc.listError = null;
    gdacsStorms.listError = new StormProviderError("GDACS list failed.");
    await assert.rejects(repository.getActiveStorms("gdacs"), StormProviderError);
    assert.equal(nhc.listCalls, 1);
});

test("Composite storm repository still returns one provider's storms when the other fails", async () => {
    const nhc = new CountingNhcStormRepository([nhcSummary()]);
    const gdacsStorms = new CountingGdacsStormRepository([gdacsSummary()]);
    const loggedErrors: string[] = [];

    gdacsStorms.listError = new StormProviderError("GDACS event list failed.");

    const repository = new CompositeStormRepository(
        nhc,
        new CountingGdacsStormConeRepository(),
        gdacsStorms,
        (message) => loggedErrors.push(message),
    );

    assert.deepEqual(
        (await repository.getActiveStorms()).map((storm) => storm.stormId),
        ["nhc:EP072026"],
    );
    assert.equal(loggedErrors.length, 1);
    assert.match(loggedErrors[0] ?? "", /GDACS event list failed/);
});

test("Composite storm repository returns GDACS storms for all when NHC fails", async () => {
    const nhc = new CountingNhcStormRepository([nhcSummary()]);
    const gdacsStorms = new CountingGdacsStormRepository([gdacsSummary()]);
    nhc.listError = new StormProviderError("NHC list failed.");

    const repository = new CompositeStormRepository(
        nhc,
        new CountingGdacsStormConeRepository(),
        gdacsStorms,
        () => undefined,
    );

    assert.deepEqual(await repository.getActiveStorms(), [gdacsSummary()]);
});

test("Composite storm repository fails the active storm list only when every provider fails", async () => {
    const nhc = new CountingNhcStormRepository([nhcSummary()]);
    const gdacsStorms = new CountingGdacsStormRepository([gdacsSummary()]);

    nhc.listError = new StormProviderError("NHC list failed.");
    gdacsStorms.listError = new StormProviderError("GDACS list failed.");

    const repository = new CompositeStormRepository(
        nhc,
        new CountingGdacsStormConeRepository(),
        gdacsStorms,
        () => undefined,
    );

    await assert.rejects(repository.getActiveStorms(), StormProviderError);
});

test("Composite storm repository sends GDACS track requests to GDACS only", async () => {
    const nhc = new CountingNhcStormRepository();
    const gdacsStorms = new CountingGdacsStormRepository([]);
    const repository = new CompositeStormRepository(nhc, new CountingGdacsStormConeRepository(), gdacsStorms);

    assert.equal((await repository.getStormTrack("gdacs:TC:1001297:51")).source, "gdacs");
    assert.equal((await repository.getStormTrack("nhc:EP072026")).source, "nhc");

    assert.equal(gdacsStorms.trackCalls, 1);
    assert.equal(nhc.trackCalls, 1);
});

test("Composite storm repository keeps NHC tracks when GDACS storms are not composed", async () => {
    const nhc = new CountingNhcStormRepository();
    const repository = new CompositeStormRepository(nhc, new CountingGdacsStormConeRepository());

    assert.equal((await repository.getStormTrack("gdacs:TC:1001297:51")).source, "nhc");
    assert.equal(nhc.trackCalls, 1);
});

test("Composite historical storm track repository routes by storm ID prefix", async () => {
    const nhc = new CountingHistoricalStormTrackRepository("nhc");
    const gdacs = new CountingHistoricalStormTrackRepository("gdacs");
    const repository = new CompositeHistoricalStormTrackRepository(nhc, gdacs);

    assert.equal((await repository.getHistoricalStormTrack("nhc:EP072026")).source, "nhc");
    assert.equal((await repository.getHistoricalStormTrack("gdacs:TC:1001297:51")).source, "gdacs");

    assert.deepEqual(nhc.stormIds, ["nhc:EP072026"]);
    assert.deepEqual(gdacs.stormIds, ["gdacs:TC:1001297:51"]);
});

function nhcSummary (): StormSummary {
    return {
        stormId: "nhc:EP072026",
        name: "Genevieve",
        source: "nhc",
        basin: "eastern_north_pacific",
        lat: 22.3,
        lon: -130.2,
        datetime: "2026-07-31T21:00:00.000Z",
        windSpeed: 50,
        category: null,
    };
}

function gdacsSummary (): StormSummary {
    return {
        stormId: "gdacs:TC:1001297:51",
        name: "DOLPHIN-26",
        source: "gdacs",
        basin: null,
        lat: 27,
        lon: 124.8,
        datetime: "2026-08-08T12:00:00.000Z",
        windSpeed: 145,
        category: "category_5",
    };
}

class CountingGdacsStormRepository implements ActiveStormsRepository, StormTrackRepository {
    public listCalls = 0;
    public trackCalls = 0;
    public listError: Error | null = null;

    public constructor (private readonly _summaries: StormSummary[]) {}

    public async getActiveStorms (): Promise<StormSummary[]> {
        this.listCalls += 1;

        if (this.listError) {
            throw this.listError;
        }

        return this._summaries;
    }

    public async getStormTrack (stormId: string): Promise<StormTrack> {
        this.trackCalls += 1;

        return {
            stormId,
            name: "DOLPHIN-26",
            source: "gdacs",
            issuedAt: "2026-08-08T16:50:16.000Z",
            cachedUntil: null,
            observed: [],
            forecast: [],
        };
    }
}

class CountingHistoricalStormTrackRepository implements HistoricalStormTrackRepository {
    public readonly stormIds: string[] = [];

    public constructor (private readonly _source: "nhc" | "gdacs") {}

    public async getHistoricalStormTrack (stormId: string): Promise<HistoricalStormTrack> {
        this.stormIds.push(stormId);

        return {
            stormId,
            name: "Storm",
            source: this._source,
            trackKind: null,
            cachedUntil: null,
            availability: "not_available",
            reason: "No history.",
            history: [],
        };
    }
}

test("Cached composite repository caches GDACS geometry for two hours only when available", async () => {
    const gdacs = new CountingGdacsStormConeRepository();
    let now = Date.parse("2026-08-05T00:00:00.000Z");
    const repository = new CachedStormRepository(
        new CompositeStormRepository(new CountingNhcStormRepository(), gdacs),
        7_200_000,
        3_600_000,
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
    public listError: Error | null = null;

    public constructor (private readonly _summaries: StormSummary[] = []) {}

    public async getActiveStorms (): Promise<StormSummary[]> {
        this.listCalls += 1;

        if (this.listError) {
            throw this.listError;
        }

        return this._summaries;
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
