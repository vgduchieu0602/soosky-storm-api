import assert from "node:assert/strict";
import test from "node:test";
import StormAlert from "../src/domain/entities/alert/StormAlert.js";
import StormState from "../src/domain/entities/alert/StormState.js";
import StormSummary from "../src/domain/entities/storm/StormSummary.js";
import ActiveStormsRepository from "../src/domain/repositories/storm/IActiveStormsRepository.js";
import StormAlertRepository from "../src/domain/repositories/alert/IStormAlertRepository.js";
import StormStateRepository from "../src/domain/repositories/alert/IStormStateRepository.js";
import DetectStormAlertsUseCase from "../src/domain/use-cases/alert/DetectStormAlertsUseCase.js";

const STORM_ID = "nhc:EP072026";

test("detects a new storm and records it", async () => {
    const world = createWorld({ storms: [storm({})] });

    const result = await world.useCase.execute();

    assert.deepEqual(result.alerts.map((alert) => alert.type), ["new_storm"]);
    assert.equal(result.saved, 1);
    assert.equal(world.alerts.saved[0]?.title, "New storm: Genevieve");
});

test("raises no alert when nothing about the storm changed", async () => {
    const world = createWorld({ storms: [storm({})] });

    await world.useCase.execute();
    const second = await world.useCase.execute();

    assert.deepEqual(second.alerts, []);
    assert.equal(world.alerts.saved.length, 1);
});

test("detects a category change and names both ends of it", async () => {
    const world = createWorld({ storms: [storm({ category: "category_1", windSpeed: 70 })] });

    await world.useCase.execute();
    world.storms.storms = [storm({ windSpeed: 90, category: "category_2" })];

    const result = await world.useCase.execute();
    const alert = result.alerts[0]!;

    assert.equal(alert.type, "category_change");
    assert.equal(alert.previousValue, "category_1");
    assert.equal(alert.currentValue, "category_2");
    assert.equal(alert.title, "Genevieve strengthened");
    assert.match(alert.description, /Genevieve strengthened from Category 1 to Category 2\./);
    assert.match(alert.description, /Winds now at 167 km\/h/);
});

test("reads a weakening storm as weakened, not strengthened", async () => {
    const world = createWorld({ storms: [storm({ category: "category_3", windSpeed: 105 })] });

    await world.useCase.execute();
    world.storms.storms = [storm({ category: "category_2", windSpeed: 90 })];

    const alert = (await world.useCase.execute()).alerts[0]!;

    assert.equal(alert.title, "Genevieve weakened");
    assert.match(alert.description, /weakened from Category 3 to Category 2\./);
});

test("describes dropping off the hurricane scale", async () => {
    const world = createWorld({ storms: [storm({ category: "category_1", windSpeed: 70 })] });

    await world.useCase.execute();
    world.storms.storms = [storm({ category: null, windSpeed: 50 })];

    const alert = (await world.useCase.execute()).alerts[0]!;

    assert.equal(alert.title, "Genevieve weakened");
    assert.match(alert.description, /weakened from Category 1 to tropical storm strength\./);
});

test("appends the deterministic safety message for Category 1-5", async () => {
    const examples = [
        ["category_1", 70, "Secure loose items, check emergency supplies now"],
        ["category_2", 90, "Review evacuation route. Power outages likely"],
        ["category_3", 105, "Major hurricane. Follow evacuation orders if issued"],
        ["category_4", 120, "Catastrophic winds. Evacuate now if advised."],
        ["category_5", 140, "Extreme danger. Leave immediately if ordered."],
    ] as const;
    const world = createWorld({ storms: [storm({})] });

    await world.useCase.execute();

    for (const [category, windSpeed, expectedMessage] of examples) {
        world.storms.storms = [storm({ windSpeed, category })];
        world.alerts.saved.length = 0;

        await world.useCase.execute();

        assert.match(
            world.alerts.saved[0]?.description ?? "",
            new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        );
    }
});

test("detects a track change only after the heading turns far enough", async () => {
    const world = createWorld({ storms: [storm({})] });

    await world.useCase.execute();
    // Establish a westward heading first, so a bearing exists to compare against.
    world.storms.storms = [storm({ lon: -131.2 })];
    await world.useCase.execute();

    // Keep heading west: no course change.
    world.storms.storms = [storm({ lon: -132.2 })];
    const straight = await world.useCase.execute();

    assert.deepEqual(straight.alerts.map((alert) => alert.type), []);

    // Turn hard north.
    world.storms.storms = [storm({ lon: -132.2, lat: 24.3, datetime: "2026-08-01T03:00:00.000Z" })];
    const turned = await world.useCase.execute();
    const alert = turned.alerts[0]!;

    assert.equal(alert.type, "track_change");
    assert.equal(alert.previousValue, "W");
    assert.equal(alert.currentValue, "N");
    assert.equal(alert.title, "Genevieve changed course");
    assert.match(alert.description, /New heading: N \(was W\)/);
});

test("ignores jitter below the movement threshold", async () => {
    const world = createWorld({ storms: [storm({})] });

    await world.useCase.execute();
    world.storms.storms = [storm({ lon: -131.2 })];
    await world.useCase.execute();

    world.storms.storms = [storm({ lon: -131.21, lat: 22.31 })];
    const result = await world.useCase.execute();

    assert.deepEqual(result.alerts, []);
});

test("detects a GDACS alert level change and names the previous level", async () => {
    const gdacsStorm = storm({ stormId: "gdacs:TC:1001297:51", alertLevel: "Orange" });
    const world = createWorld({ storms: [gdacsStorm] });

    await world.useCase.execute();
    world.storms.storms = [{ ...gdacsStorm, alertLevel: "Red", datetime: "2026-08-01T03:00:00.000Z" }];

    const alert = (await world.useCase.execute()).alerts[0]!;

    assert.equal(alert.type, "alert_level_change");
    assert.equal(alert.previousValue, "Orange");
    assert.equal(alert.currentValue, "Red");
    assert.equal(alert.title, "Genevieve alert level: Red");
    assert.match(alert.description, /changed from Orange to Red/);
});

test("detects a watch or warning change", async () => {
    const world = createWorld({ storms: [storm({ watchWarning: "Tropical Storm Watch" })] });

    await world.useCase.execute();
    world.storms.storms = [storm({ watchWarning: "Hurricane Warning" })];

    const alert = (await world.useCase.execute()).alerts[0]!;

    assert.equal(alert.type, "watch_warning");
    assert.equal(alert.title, "Genevieve watch/warning updated");
    assert.match(alert.description, /Hurricane Warning/);
});

test("detects a dissipated storm and clears its stored state", async () => {
    const world = createWorld({ storms: [storm({})] });

    await world.useCase.execute();
    world.storms.storms = [];

    const result = await world.useCase.execute();
    const alert = result.alerts[0]!;

    assert.equal(alert.type, "storm_dissipated");
    assert.equal(alert.title, "Genevieve has dissipated");
    assert.equal(alert.description, "Genevieve is no longer an active storm.");
    // The last observation is what dates the alert: the storm is gone from the source.
    assert.equal(alert.observedAt, "2026-07-31T21:00:00.000Z");
    assert.deepEqual(await world.states.listStates(), []);
});

test("records the alert even when nothing can receive a push", async () => {
    const world = createWorld({ storms: [storm({})] });

    const result = await world.useCase.execute();

    assert.equal(result.saved, 1);
    assert.equal(world.alerts.saved.length, 1);
    assert.equal((await world.states.listStates()).length, 1);
});

test("carries no device-specific wording into the stored alert", async () => {
    const world = createWorld({ storms: [storm({})] });

    await world.useCase.execute();

    assert.equal(world.alerts.saved[0]?.description.includes("km from your area"), false);
});

test("treats a GDACS episode bump as the same storm, not a new one", async () => {
    const episode51 = storm({ stormId: "gdacs:TC:1001297:51", name: "DOLPHIN-26", alertLevel: "Orange" });
    const world = createWorld({ storms: [episode51] });

    const first = await world.useCase.execute();

    assert.deepEqual(first.alerts.map((alert) => alert.type), ["new_storm"]);

    // GDACS republishes the same event under a new episode ID.
    world.storms.storms = [{ ...episode51, stormId: "gdacs:TC:1001297:53" }];

    const second = await world.useCase.execute();

    assert.deepEqual(second.alerts, [], "an episode bump alone must raise no alert");
    assert.equal((await world.states.listStates()).length, 1, "the storm must occupy one state row");
    assert.equal((await world.states.listStates())[0]?.stormId, "gdacs:TC:1001297:53");
});

test("records the last observed time on the state so a dissipation can be dated", async () => {
    const world = createWorld({ storms: [storm({})] });

    await world.useCase.execute();

    assert.equal((await world.states.listStates())[0]?.datetime, "2026-07-31T21:00:00.000Z");
});

// --- Duplicate protection ----------------------------------------------------

test("replaying an interrupted cycle records the alert once, not twice", async () => {
    const world = createWorld({ storms: [storm({})] });

    await world.useCase.execute();
    // The state write is what an interrupted cycle would have missed, so drop it and
    // let detection see the same change again.
    world.states.states.clear();

    const result = await world.useCase.execute();

    assert.deepEqual(result.alerts.map((alert) => alert.type), ["new_storm"]);
    assert.equal(result.saved, 0, "the alert was already recorded");
    assert.equal(result.skippedAsDuplicate, 1);
    assert.equal(world.alerts.stored.size, 1, "no second row for the same change");
});

test("a storm that oscillates raises an alert every time it changes", async () => {
    const world = createWorld({ storms: [storm({ category: "category_2", windSpeed: 90 })] });

    await world.useCase.execute();

    const steps = [
        { category: "category_3", windSpeed: 105, datetime: "2026-08-01T03:00:00.000Z" },
        { category: "category_2", windSpeed: 90, datetime: "2026-08-01T09:00:00.000Z" },
        { category: "category_3", windSpeed: 105, datetime: "2026-08-01T15:00:00.000Z" },
    ] as const;

    for (const step of steps) {
        world.storms.storms = [storm(step)];

        const result = await world.useCase.execute();

        assert.equal(result.saved, 1, "each real change is its own alert");
    }

    assert.equal(world.alerts.stored.size, 4, "one formation plus three category changes");
});

test("derives the alert id from the change rather than the clock", async () => {
    const world = createWorld({ storms: [storm({})] });

    await world.useCase.execute();

    assert.equal(world.alerts.saved[0]?.id, STORM_ID + "|new_storm||2026-07-31T21:00:00.000Z");
});

function storm (overrides: Partial<StormSummary>): StormSummary {
    return {
        stormId: STORM_ID,
        name: "Genevieve",
        source: "nhc",
        basin: "eastern_north_pacific",
        lat: 22.3,
        lon: -130.2,
        datetime: "2026-07-31T21:00:00.000Z",
        windSpeed: 50,
        category: null,
        alertLevel: null,
        ...overrides,
    };
}

interface WorldOptions {
    storms: StormSummary[];
}

function createWorld (options: WorldOptions) {
    const storms = new MemoryActiveStorms(options.storms);
    const states = new MemoryStormStates();
    const alerts = new MemoryStormAlerts();
    const useCase = new DetectStormAlertsUseCase(storms, states, alerts);

    return { storms, states, alerts, useCase };
}

class MemoryActiveStorms implements ActiveStormsRepository {
    public constructor (public storms: StormSummary[]) {}

    public async getActiveStorms (): Promise<StormSummary[]> {
        return this.storms;
    }
}

class MemoryStormStates implements StormStateRepository {
    public readonly states = new Map<string, StormState>();

    public async listStates (): Promise<StormState[]> {
        return [...this.states.values()];
    }

    public async saveState (state: StormState): Promise<void> {
        this.states.set(state.trackingId, state);
    }

    public async removeState (trackingId: string): Promise<void> {
        this.states.delete(trackingId);
    }
}

class MemoryStormAlerts implements StormAlertRepository {
    /** Every alert handed to the repository, including ones it recognised as stored. */
    public readonly saved: StormAlert[] = [];
    public readonly stored = new Map<string, StormAlert>();

    public async saveAlerts (alerts: StormAlert[]): Promise<number> {
        let saved = 0;

        for (const alert of alerts) {
            this.saved.push(alert);

            if (this.stored.has(alert.id)) {
                continue;
            }

            this.stored.set(alert.id, alert);
            saved += 1;
        }

        return saved;
    }

    public async listAlertsByTrackingIds (trackingIds: string[], limit: number): Promise<StormAlert[]> {
        return [...this.stored.values()]
            .filter((alert) => trackingIds.includes(alert.trackingId))
            .slice(0, limit);
    }
}
