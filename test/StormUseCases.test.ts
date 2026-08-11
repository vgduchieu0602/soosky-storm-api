import assert from "node:assert/strict";
import test from "node:test";
import StormSummary from "../src/domain/entities/StormSummary.js";
import StormCone from "../src/domain/entities/StormCone.js";
import StormTrack from "../src/domain/entities/StormTrack.js";
import StormNotFoundError from "../src/domain/errors/StormNotFoundError.js";
import StormRepository from "../src/domain/repositories/IStormRepository.js";
import GetActiveStormsUseCase from "../src/domain/use-cases/storm/GetActiveStormsUseCase.js";
import GetDemoStormsUseCase from "../src/domain/use-cases/storm/GetDemoStormsUseCase.js";
import GetStormConeUseCase from "../src/domain/use-cases/storm/GetStormConeUseCase.js";
import GetStormTrackUseCase from "../src/domain/use-cases/storm/GetStormTrackUseCase.js";

test("Storms use case returns active storm summaries from the repository", async () => {
    const summary: StormSummary = {
        stormId: "nhc:EP072026",
        name: "Genevieve",
        source: "nhc",
        basin: "eastern_north_pacific",
        lat: 22.3,
        lon: -130.2,
        datetime: "2026-07-31T21:00:00.000Z",
        windSpeed: 50,
        category: "tropical_storm",
    };
    const repository = new MemoryStormRepository([summary]);
    const useCase = new GetActiveStormsUseCase(repository);

    assert.deepEqual(await useCase.execute(), [summary]);
});

test("Demo storms use case generates between one and five clearly marked storms", async () => {
    const minimum = await new GetDemoStormsUseCase(() => 0).execute();
    const maximum = await new GetDemoStormsUseCase(() => 0.999).execute();

    assert.equal(minimum.length, 1);
    assert.equal(maximum.length, 5);
    assert.equal(maximum.every((storm) => storm.isDemo), true);
});

test("Storms use case returns the requested track from the repository", async () => {
    const repository = new MemoryStormRepository([]);
    const useCase = new GetStormTrackUseCase(repository);

    await useCase.execute({ stormId: "nhc:EP072026" });

    assert.deepEqual(repository.trackIds, ["nhc:EP072026"]);
});

test("Storms use case rejects an empty storm ID", async () => {
    const useCase = new GetStormTrackUseCase(new MemoryStormRepository([]));

    await assert.rejects(
        useCase.execute({ stormId: " " }),
        StormNotFoundError,
    );
});

test("Storms use case returns the requested cone from the repository", async () => {
    const repository = new MemoryStormRepository([]);
    const useCase = new GetStormConeUseCase(repository);

    assert.equal((await useCase.execute({ stormId: "nhc:EP072026" })).stormId, "nhc:EP072026");
    assert.deepEqual(repository.coneIds, ["nhc:EP072026"]);
});

class MemoryStormRepository implements StormRepository {
    public readonly trackIds: string[] = [];
    public readonly coneIds: string[] = [];

    public constructor (private readonly _summaries: StormSummary[]) {}

    public async getActiveStorms (): Promise<StormSummary[]> {
        return this._summaries;
    }

    public async getStormTrack (stormId: string): Promise<StormTrack> {
        this.trackIds.push(stormId);

        return {
            stormId,
            name: "Genevieve",
            source: "nhc",
            issuedAt: "2026-07-31T21:00:00.000Z",
            cachedUntil: null,
            observed: [],
            forecast: [],
        };
    }

    public async getStormCone (stormId: string): Promise<StormCone> {
        this.coneIds.push(stormId);

        return {
            stormId,
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
                    coordinates: [[[-130, 20], [-131, 21], [-132, 20], [-130, 20]]],
                },
            },
        };
    }
}
