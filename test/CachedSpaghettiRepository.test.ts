import assert from "node:assert/strict";
import test from "node:test";
import CachedSpaghettiRepository from "../src/adapters/cache/CachedSpaghettiRepository.js";
import StormSpaghetti from "../src/domain/entities/StormSpaghetti.js";
import SpaghettiRepository from "../src/domain/repositories/ISpaghettiRepository.js";

test("Spaghetti cache reuses an available response until the two-hour TTL expires", async () => {
    const source = new CountingSpaghettiRepository();
    let now = Date.parse("2026-08-05T00:00:00.000Z");
    const repository = new CachedSpaghettiRepository(source, 7_200_000, () => now);

    const first = await repository.getStormSpaghetti("nhc:EP072026");
    const second = await repository.getStormSpaghetti("nhc:EP072026");

    assert.equal(source.calls, 1);
    assert.equal(first.cachedUntil, "2026-08-05T02:00:00.000Z");
    assert.equal(second.cachedUntil, "2026-08-05T02:00:00.000Z");

    now = Date.parse("2026-08-05T02:00:00.000Z");
    const refreshed = await repository.getStormSpaghetti("nhc:EP072026");

    assert.equal(source.calls, 2);
    assert.equal(refreshed.cachedUntil, "2026-08-05T04:00:00.000Z");
});

test("Spaghetti cache does not cache unavailable results", async () => {
    const source = new CountingSpaghettiRepository("not_available");
    const repository = new CachedSpaghettiRepository(source, 7_200_000);

    const first = await repository.getStormSpaghetti("nhc:EP072026");
    const second = await repository.getStormSpaghetti("nhc:EP072026");

    assert.equal(source.calls, 2);
    assert.equal(first.cachedUntil, null);
    assert.equal(second.cachedUntil, null);
});

class CountingSpaghettiRepository implements SpaghettiRepository {
    public calls = 0;

    public constructor (private readonly _availability: "available" | "not_available" = "available") {}

    public async getStormSpaghetti (stormId: string): Promise<StormSpaghetti> {
        this.calls += 1;

        if (this._availability === "not_available") {
            return {
                stormId,
                source: "nhc-atcf",
                cycleTime: null,
                cachedUntil: null,
                availability: "not_available",
                reason: "NHC has not published usable model forecast data for this storm.",
                models: [],
            };
        }

        return {
            stormId,
            source: "nhc-atcf",
            cycleTime: "2026-08-05T00:00:00.000Z",
            cachedUntil: null,
            availability: "available",
            models: [],
        };
    }
}
