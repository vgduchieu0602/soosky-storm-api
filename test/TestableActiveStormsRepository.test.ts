import assert from "node:assert/strict";
import test from "node:test";
import TestableActiveStormsRepository from "../src/adapters/storm/TestableActiveStormsRepository.js";
import StormSummary from "../src/domain/entities/storm/StormSummary.js";
import ActiveStormsRepository from "../src/domain/repositories/storm/IActiveStormsRepository.js";

test("Testable repository passes every storm through when test mode is off", async () => {
    const source = new CountingActiveStormsRepository();
    const repository = new TestableActiveStormsRepository(source, new Set(), false);

    assert.deepEqual(await repository.getActiveStorms(), [ALPHA, BETA, GAMMA]);
    assert.equal(source.calls, 1);
});

test("Testable repository passes every storm through while nothing is hidden", async () => {
    const source = new CountingActiveStormsRepository();
    const repository = new TestableActiveStormsRepository(source, new Set(), true);

    assert.deepEqual(await repository.getActiveStorms(), [ALPHA, BETA, GAMMA]);
    assert.equal(source.calls, 1);
});

test("Testable repository drops hidden storms in test mode", async () => {
    const source = new CountingActiveStormsRepository();
    const repository = new TestableActiveStormsRepository(source, new Set(), true);

    repository.hideStorm(ALPHA.stormId);

    assert.deepEqual(await repository.getActiveStorms(), [BETA, GAMMA]);
    assert.equal(source.calls, 1);
});

test("Testable repository reports which storms are hidden", () => {
    const repository = new TestableActiveStormsRepository(new CountingActiveStormsRepository(), new Set(), true);

    repository.hideStorm(BETA.stormId);

    assert.equal(repository.isHidden(ALPHA.stormId), false);
    assert.equal(repository.isHidden(BETA.stormId), true);
});

test("Testable repository clears every hidden storm", async () => {
    const hiddenStormIds = new Set<string>();
    const repository = new TestableActiveStormsRepository(new CountingActiveStormsRepository(), hiddenStormIds, true);

    repository.hideStorm(ALPHA.stormId);
    repository.hideStorm(GAMMA.stormId);

    assert.equal(hiddenStormIds.size, 2);

    repository.clearHidden();

    assert.equal(hiddenStormIds.size, 0);
    assert.deepEqual(await repository.getActiveStorms(), [ALPHA, BETA, GAMMA]);
});

test("Testable repository records hidden storms but keeps serving them when test mode is off", async () => {
    const hiddenStormIds = new Set<string>();
    const repository = new TestableActiveStormsRepository(new CountingActiveStormsRepository(), hiddenStormIds, false);

    // The set still accepts the identifier so flipping test mode on needs no extra state.
    repository.hideStorm(ALPHA.stormId);

    assert.deepEqual(await repository.getActiveStorms(), [ALPHA, BETA, GAMMA]);
    assert.equal(repository.isHidden(ALPHA.stormId), true);
});

const ALPHA = toStorm("nhc:al012024", "ALPHA", "nhc");
const BETA = toStorm("nhc:al022024", "BETA", "nhc");
const GAMMA = toStorm("gdacs:TC:123:456", "GAMMA", "gdacs");

function toStorm (stormId: string, name: string, source: StormSummary["source"]): StormSummary {
    return {
        stormId,
        name,
        source,
        basin: "atlantic",
        lat: 20,
        lon: -60,
        datetime: "2024-09-01T00:00:00.000Z",
        windSpeed: 65,
        category: "category_1",
        alertLevel: null,
    };
}

class CountingActiveStormsRepository implements ActiveStormsRepository {
    public calls = 0;

    public async getActiveStorms (): Promise<StormSummary[]> {
        this.calls += 1;

        return [ALPHA, BETA, GAMMA];
    }
}
