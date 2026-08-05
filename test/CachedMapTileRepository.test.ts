import assert from "node:assert/strict";
import test from "node:test";
import CachedMapTileRepository from "../src/adapters/cache/CachedMapTileRepository.js";
import MapTile, { MapTileQuery } from "../src/domain/entities/MapTile.js";
import MapTileRepository from "../src/domain/repositories/IMapTileRepository.js";

const TTL_MS = 43_200_000;

test("Map tile cache reuses successful tiles until its exact 12-hour expiry", async () => {
    const source = new CountingMapTileRepository();
    let now = Date.parse("2026-08-05T00:00:00.000Z");
    const repository = new CachedMapTileRepository(source, TTL_MS, () => now);
    const query: MapTileQuery = { layer: "windSpeed", z: 3, x: 6, y: 3 };

    assert.equal((await repository.getTile(query)).buffer.toString(), "tile-1");
    await repository.getTile(query);
    assert.equal(source.calls, 1);

    now += TTL_MS;
    assert.equal((await repository.getTile(query)).buffer.toString(), "tile-2");
    assert.equal(source.calls, 2);
});

test("Map tile cache separates keys and does not cache failures", async () => {
    const source = new CountingMapTileRepository();
    const repository = new CachedMapTileRepository(source, TTL_MS);

    await repository.getTile({ layer: "windSpeed", z: 3, x: 6, y: 3 });
    await repository.getTile({ layer: "temperature", z: 3, x: 6, y: 3 });
    assert.equal(source.calls, 2);

    source.throwNext = true;
    await assert.rejects(repository.getTile({ layer: "precipitation", z: 3, x: 6, y: 3 }));
    await repository.getTile({ layer: "precipitation", z: 3, x: 6, y: 3 });
    assert.equal(source.calls, 4);
});

test("Map tile cache evicts the least-recently-used successful entry above 500 entries", async () => {
    const source = new CountingMapTileRepository();
    const repository = new CachedMapTileRepository(source, TTL_MS);
    const oldest: MapTileQuery = { layer: "windSpeed", z: 5, x: 0, y: 0 };

    await repository.getTile(oldest);
    for (let index = 1; index <= 500; index += 1) {
        await repository.getTile({ layer: "windSpeed", z: 5, x: index % 32, y: Math.floor(index / 32) });
    }

    assert.equal(source.calls, 501);
    await repository.getTile(oldest);
    assert.equal(source.calls, 502);
});

class CountingMapTileRepository implements MapTileRepository {
    public calls = 0;
    public throwNext = false;

    public async getTile (_query: MapTileQuery): Promise<MapTile> {
        this.calls += 1;
        if (this.throwNext) {
            this.throwNext = false;
            throw new Error("upstream failure");
        }

        return { buffer: Buffer.from("tile-" + this.calls), contentType: "image/png" };
    }
}
