import assert from "node:assert/strict";
import test from "node:test";
import MapTile, { MapTileQuery } from "../src/domain/entities/MapTile.js";
import Radar from "../src/domain/entities/Radar.js";
import MapTileRepository from "../src/domain/repositories/IMapTileRepository.js";
import RadarRepository from "../src/domain/repositories/IRadarRepository.js";
import GetMapTileUseCase from "../src/domain/use-cases/map/GetMapTileUseCase.js";
import GetRadarUseCase from "../src/domain/use-cases/radar/GetRadarUseCase.js";

test("Map Tile use case delegates the exact tile query and returns its PNG buffer", async () => {
    const repository = new MemoryMapTileRepository();
    const useCase = new GetMapTileUseCase(repository);
    const query: MapTileQuery = { layer: "windSpeed", z: 3, x: 6, y: 3 };

    const tile = await useCase.execute(query);

    assert.deepEqual(repository.queries, [query]);
    assert.equal(tile.buffer, repository.tile.buffer);
    assert.equal(tile.contentType, "image/png");
});

test("Radar use case returns the port response unchanged", async () => {
    const repository = new MemoryRadarRepository();
    const useCase = new GetRadarUseCase(repository);

    assert.deepEqual(await useCase.execute(), repository.radar);
    assert.equal(repository.calls, 1);
    assert.equal(repository.radar.cachedUntil, null);
});

class MemoryMapTileRepository implements MapTileRepository {
    public readonly queries: MapTileQuery[] = [];

    public readonly tile: MapTile = {
        buffer: Buffer.from("png"),
        contentType: "image/png",
    };

    public async getTile (query: MapTileQuery): Promise<MapTile> {
        this.queries.push(query);
        return this.tile;
    }
}

class MemoryRadarRepository implements RadarRepository {
    public calls = 0;

    public readonly radar: Radar = {
        source: "rainviewer",
        attribution: "Weather data by RainViewer",
        attributionUrl: "https://www.rainviewer.com/",
        host: "https://tilecache.rainviewer.com",
        tileTemplate: "{host}{path}/256/{z}/{x}/{y}/2/1_1.png",
        past: [{ time: "2026-08-05T00:00:00.000Z", path: "/v2/radar/1" }],
        nowcast: [],
        generatedAt: "2026-08-05T00:00:00.000Z",
        cachedUntil: null,
    };

    public async getRadar (): Promise<Radar> {
        this.calls += 1;
        return this.radar;
    }
}
