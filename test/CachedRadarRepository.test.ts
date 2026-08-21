import assert from "node:assert/strict";
import test from "node:test";
import CachedRadarRepository from "../src/adapters/cache/CachedRadarRepository.js";
import Radar from "../src/domain/entities/radar/Radar.js";
import RadarRepository from "../src/domain/repositories/radar/IRadarRepository.js";

const TTL_MS = 43_200_000;

test("Radar cache reuses successful metadata until its exact 12-hour expiry", async () => {
    const source = new CountingRadarRepository();
    let now = Date.parse("2026-08-05T00:00:00.000Z");
    const repository = new CachedRadarRepository(source, TTL_MS, () => now);

    const first = await repository.getRadar();
    const second = await repository.getRadar();
    assert.equal(source.calls, 1);
    assert.equal(first.cachedUntil, "2026-08-05T12:00:00.000Z");
    assert.equal(second.cachedUntil, "2026-08-05T12:00:00.000Z");

    now += TTL_MS;
    const refreshed = await repository.getRadar();
    assert.equal(source.calls, 2);
    assert.equal(refreshed.cachedUntil, "2026-08-06T00:00:00.000Z");
});

test("Radar cache does not cache upstream failures", async () => {
    const source = new CountingRadarRepository();
    const repository = new CachedRadarRepository(source, TTL_MS);

    source.throwNext = true;
    await assert.rejects(repository.getRadar());
    await repository.getRadar();
    assert.equal(source.calls, 2);
});

class CountingRadarRepository implements RadarRepository {
    public calls = 0;
    public throwNext = false;

    public async getRadar (): Promise<Radar> {
        this.calls += 1;
        if (this.throwNext) {
            this.throwNext = false;
            throw new Error("upstream failure");
        }

        return {
            source: "rainviewer",
            attribution: "Weather data by RainViewer",
            attributionUrl: "https://www.rainviewer.com/",
            host: "https://tilecache.rainviewer.com",
            tileTemplate: "https://tilecache.rainviewer.com{path}/256/{z}/{x}/{y}/2/1_1.png",
            past: [],
            nowcast: [],
            generatedAt: "2026-08-05T00:00:00.000Z",
            cachedUntil: null,
        };
    }
}
