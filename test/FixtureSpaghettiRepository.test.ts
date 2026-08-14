import assert from "node:assert/strict";
import test from "node:test";
import FixtureSpaghettiRepository from "../src/adapters/fixture/FixtureSpaghettiRepository.js";

test("fixture spaghetti repository fans three models out of a fixture storm centre", async () => {
    const repository = new FixtureSpaghettiRepository();
    const spaghetti = await repository.getStormSpaghetti("nhc:EP072026");

    assert.equal(spaghetti.availability, "available");
    assert.equal(spaghetti.cycleTime, "2026-08-08T12:00:00.000Z");
    assert.deepEqual(spaghetti.models.map((model) => model.code), ["AVNO", "AEMN", "NVGM"]);
    assert.deepEqual(spaghetti.models[0]?.points.map((point) => point.forecastHour), [12, 24, 36, 48, 72]);

    const first = spaghetti.models[0]?.points[0];
    const second = spaghetti.models[1]?.points[0];

    assert.notDeepEqual([first?.lat, first?.lon], [second?.lat, second?.lon]);
    assert.ok((first?.windSpeed ?? 0) > 30);
});

test("fixture spaghetti repository reports a storm without model data as not available", async () => {
    const repository = new FixtureSpaghettiRepository();
    const spaghetti = await repository.getStormSpaghetti("nhc:AL012026");

    assert.equal(spaghetti.availability, "not_available");
    assert.deepEqual(spaghetti.models, []);
    assert.equal(spaghetti.cycleTime, null);
    assert.ok(spaghetti.reason);
});

test("fixture spaghetti repository reports a non-NHC storm as not supported", async () => {
    const repository = new FixtureSpaghettiRepository();
    const spaghetti = await repository.getStormSpaghetti("gdacs:TC:1001297:51");

    assert.equal(spaghetti.availability, "not_supported");
    assert.deepEqual(spaghetti.models, []);
});

test("fixture spaghetti repository is deterministic", async () => {
    const repository = new FixtureSpaghettiRepository();

    assert.deepEqual(
        await repository.getStormSpaghetti("nhc:AL022026"),
        await repository.getStormSpaghetti("nhc:AL022026"),
    );
});
