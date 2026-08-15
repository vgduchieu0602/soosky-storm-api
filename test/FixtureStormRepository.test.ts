import assert from "node:assert/strict";
import test from "node:test";
import FixtureStormRepository from "../src/adapters/fixture/FixtureStormRepository.js";

test("fixture storm repository provides diverse active storms with complete detail data", async () => {
    const repository = new FixtureStormRepository();
    const activeStorms = await repository.getActiveStorms();

    assert.deepEqual(activeStorms.map((storm) => storm.stormId), [
        "nhc:AL012026",
        "nhc:AL022026",
        "nhc:AL032026",
        "nhc:EP072026",
        "nhc:EP082026",
        "nhc:CP012026",
        "nhc:CP022026",
        "gdacs:TC:1001297:51",
        "gdacs:TC:1001432:3",
    ]);
    assert.deepEqual(activeStorms.map((storm) => storm.category), [
        "tropical_depression",
        "tropical_storm",
        "category_1",
        "category_3",
        "category_4",
        "tropical_storm",
        "category_2",
        "category_5",
        "tropical_storm",
    ]);

    for (const storm of activeStorms) {
        assert.equal((await repository.getStormTrack(storm.stormId)).stormId, storm.stormId);
        assert.equal((await repository.getStormCone(storm.stormId)).availability, "available");
    }

    assert.equal((await repository.getStormTrack("nhc:CP022026")).forecast.length, 3);
    assert.equal((await repository.getStormCone("gdacs:TC:1001432:3")).geometryKind, "gdacs_event_area");

    const history = await repository.getHistoricalStormTrack("nhc:EP032025");
    assert.equal(history.availability, "available");
    assert.ok(history.history.length > 1);
});
