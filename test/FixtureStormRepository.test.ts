import assert from "node:assert/strict";
import test from "node:test";
import FixtureStormRepository from "../src/adapters/fixture/FixtureStormRepository.js";

test("fixture storm repository always provides active, track, cone and historical data from real storm profiles", async () => {
    const repository = new FixtureStormRepository();

    assert.deepEqual((await repository.getActiveStorms()).map((storm) => storm.stormId), [
        "nhc:AL022026",
        "nhc:EP072026",
        "gdacs:TC:1001297:51",
    ]);
    assert.equal((await repository.getStormTrack("nhc:EP072026")).forecast.length, 3);
    assert.equal((await repository.getStormCone("nhc:AL022026")).availability, "available");

    const history = await repository.getHistoricalStormTrack("nhc:EP032025");
    assert.equal(history.availability, "available");
    assert.ok(history.history.length > 1);
});
