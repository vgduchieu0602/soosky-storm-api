import assert from "node:assert/strict";
import test from "node:test";
import CachedHistoricalStormTrackRepository from "../src/adapters/cache/CachedHistoricalStormTrackRepository.js";
import HistoricalStormTrack from "../src/domain/entities/HistoricalStormTrack.js";
import HistoricalStormTrackRepository from "../src/domain/repositories/IHistoricalStormTrackRepository.js";

test("Historical storm track cache reuses an available result until the two-hour TTL expires", async () => {
    const source = new CountingHistoricalStormTrackRepository();
    let now = Date.parse("2026-08-04T00:00:00.000Z");
    const repository = new CachedHistoricalStormTrackRepository(source, 7_200_000, () => now);

    const first = await repository.getHistoricalStormTrack("nhc:EP072026");
    const second = await repository.getHistoricalStormTrack("nhc:EP072026");

    assert.equal(source.calls, 1);
    assert.equal(first.cachedUntil, "2026-08-04T02:00:00.000Z");
    assert.equal(second.cachedUntil, "2026-08-04T02:00:00.000Z");

    now = Date.parse("2026-08-04T02:00:00.000Z");
    const refreshed = await repository.getHistoricalStormTrack("nhc:EP072026");

    assert.equal(source.calls, 2);
    assert.equal(refreshed.cachedUntil, "2026-08-04T04:00:00.000Z");
});

test("Historical storm track cache does not store unavailable results", async () => {
    const source = new CountingHistoricalStormTrackRepository("not_available");
    const repository = new CachedHistoricalStormTrackRepository(
        source,
        7_200_000,
        () => Date.parse("2026-08-04T00:00:00.000Z"),
    );

    const first = await repository.getHistoricalStormTrack("nhc:EP072026");
    const second = await repository.getHistoricalStormTrack("nhc:EP072026");

    assert.equal(source.calls, 2);
    assert.equal(first.cachedUntil, null);
    assert.equal(second.cachedUntil, null);
});

test("Historical storm track cache starts its TTL after a delayed source response", async () => {
    let now = Date.parse("2026-08-04T00:00:00.000Z");
    const source = new DelayedHistoricalStormTrackRepository(() => {
        now = Date.parse("2026-08-04T01:00:00.000Z");
    });
    const repository = new CachedHistoricalStormTrackRepository(source, 7_200_000, () => now);

    const track = await repository.getHistoricalStormTrack("nhc:EP072026");

    assert.equal(track.cachedUntil, "2026-08-04T03:00:00.000Z");
});

test("Historical storm track cache refreshes the least recently used storm when capacity is reached", async () => {
    const source = new CountingHistoricalStormTrackRepository();
    const repository = new CachedHistoricalStormTrackRepository(source, 7_200_000, Date.now, {
        maxEntries: 1,
        maxBytes: 10_000,
    });

    await repository.getHistoricalStormTrack("nhc:EP072026");
    await repository.getHistoricalStormTrack("nhc:EP082026");
    await repository.getHistoricalStormTrack("nhc:EP072026");

    assert.equal(source.calls, 3);
});

class CountingHistoricalStormTrackRepository implements HistoricalStormTrackRepository {
    public calls = 0;

    public constructor (private readonly _availability: HistoricalStormTrack["availability"] = "available") {}

    public async getHistoricalStormTrack (stormId: string): Promise<HistoricalStormTrack> {
        this.calls += 1;

        return {
            stormId,
            name: "Genevieve",
            source: "nhc",
            trackKind: this._availability === "available" ? "best_track" : null,
            cachedUntil: null,
            availability: this._availability,
            history: [],
            reason: this._availability === "not_available" ? "Best-track data is not available." : undefined,
        };
    }
}

class DelayedHistoricalStormTrackRepository implements HistoricalStormTrackRepository {
    public constructor (private readonly _onResponse: () => void) {}

    public async getHistoricalStormTrack (stormId: string): Promise<HistoricalStormTrack> {
        await Promise.resolve();
        this._onResponse();

        return {
            stormId,
            name: "Genevieve",
            source: "nhc",
            trackKind: "best_track",
            cachedUntil: null,
            availability: "available",
            history: [],
        };
    }
}
