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
        null,
        null,
        "category_1",
        "category_3",
        "category_4",
        null,
        "category_2",
        "category_5",
        null,
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

test("fixture storm repository provides every documented dissipated storm", async () => {
    const repository = new FixtureStormRepository();
    const stormIds = [
        "nhc:AL052025",
        "nhc:AL092025",
        "nhc:AL132025",
        "nhc:EP012025",
        "nhc:EP032025",
        "nhc:EP052025",
        "nhc:CP012025",
        "nhc:CP022025",
    ];

    const histories = await Promise.all(stormIds.map((stormId) => repository.getHistoricalStormTrack(stormId)));

    assert.ok(histories.every((history) => history.availability === "available"));
    assert.ok(histories.every((history) => history.history.length > 0));
    assert.ok(histories.every((history) => history.history.every((point) => {
        return point.category === null || point.category.startsWith("category_");
    })));
});
