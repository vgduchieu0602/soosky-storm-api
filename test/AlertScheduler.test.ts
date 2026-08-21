import assert from "node:assert/strict";
import test from "node:test";
import DetectStormAlertsUseCase, { DetectStormAlertsResult } from "../src/domain/use-cases/alert/DetectStormAlertsUseCase.js";
import startAlertScheduler from "../src/adapters/scheduler/startAlertScheduler.js";
import { getBearing, getDistanceKm, toCompassDirection } from "../src/domain/services/geo.js";

test("scheduler runs a detection cycle", async () => {
    const detector = new FakeDetector();
    const scheduler = startAlertScheduler(detector.asUseCase(), { intervalMs: 60_000, log: () => undefined });

    try {
        await scheduler.runOnce();

        assert.equal(detector.calls, 1);
    } finally {
        scheduler.stop();
    }
});

test("scheduler skips a cycle while the previous one is still running", async () => {
    const detector = new FakeDetector();
    const logs: string[] = [];
    const scheduler = startAlertScheduler(detector.asUseCase(), {
        intervalMs: 60_000,
        log: (message) => logs.push(message),
    });

    try {
        detector.block();

        const first = scheduler.runOnce();

        await scheduler.runOnce();
        assert.equal(detector.calls, 1);

        detector.release();
        await first;

        assert.equal(logs.filter((message) => message.includes("still running")).length, 1);
    } finally {
        scheduler.stop();
    }
});

test("scheduler skips a cycle while the database is not ready", async () => {
    const detector = new FakeDetector();
    let ready = false;
    const scheduler = startAlertScheduler(detector.asUseCase(), {
        intervalMs: 60_000,
        isReady: () => ready,
        log: () => undefined,
    });

    try {
        await scheduler.runOnce();
        assert.equal(detector.calls, 0);

        ready = true;
        await scheduler.runOnce();
        assert.equal(detector.calls, 1);
    } finally {
        scheduler.stop();
    }
});

test("scheduler logs a failed cycle and keeps running", async () => {
    const detector = new FakeDetector();
    const errors: string[] = [];
    const scheduler = startAlertScheduler(detector.asUseCase(), {
        intervalMs: 60_000,
        log: () => undefined,
        logError: (message) => errors.push(message),
    });

    try {
        detector.failNext = true;

        await scheduler.runOnce();

        assert.equal(errors.length, 1);
        assert.match(errors[0] ?? "", /provider down/);

        await scheduler.runOnce();

        assert.equal(detector.calls, 2);
    } finally {
        scheduler.stop();
    }
});

test("scheduler fires on its interval and stops when told to", async () => {
    const detector = new FakeDetector();
    const scheduler = startAlertScheduler(detector.asUseCase(), { intervalMs: 10, log: () => undefined });

    // Waiting on the counter rather than the clock keeps this reliable under load.
    const deadline = Date.now() + 5_000;

    while (detector.calls < 2 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }

    scheduler.stop();

    const afterStop = detector.calls;

    assert.ok(afterStop >= 2, "expected repeated cycles, saw " + afterStop);

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(detector.calls, afterStop, "expected no cycles after stop()");
});

test("distance between two points is the great-circle distance", () => {
    assert.equal(Math.round(getDistanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })), 111);
    assert.equal(Math.round(getDistanceKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })), 111);
    assert.equal(getDistanceKm({ lat: 10, lon: 20 }, { lat: 10, lon: 20 }), 0);
    assert.equal(Math.round(getDistanceKm({ lat: 10.8231, lon: 106.6297 }, { lat: 21.0278, lon: 105.8342 })), 1138);
});

test("bearing points in the expected compass direction", () => {
    assert.equal(toCompassDirection(getBearing({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })), "N");
    assert.equal(toCompassDirection(getBearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })), "E");
    assert.equal(toCompassDirection(getBearing({ lat: 0, lon: 0 }, { lat: -1, lon: 0 })), "S");
    assert.equal(toCompassDirection(getBearing({ lat: 0, lon: 0 }, { lat: 0, lon: -1 })), "W");
    assert.equal(toCompassDirection(getBearing({ lat: 0, lon: 0 }, { lat: 1, lon: 1 })), "NE");
});

test("compass direction wraps cleanly around north", () => {
    assert.equal(toCompassDirection(0), "N");
    assert.equal(toCompassDirection(360), "N");
    assert.equal(toCompassDirection(359), "N");
    assert.equal(toCompassDirection(-90), "W");
});

class FakeDetector {
    public calls = 0;
    public failNext = false;
    private _gate: Promise<void> | null = null;
    private _open: (() => void) | null = null;

    public block (): void {
        this._gate = new Promise((resolve) => {
            this._open = resolve;
        });
    }

    public release (): void {
        this._open?.();
        this._gate = null;
        this._open = null;
    }

    public asUseCase (): DetectStormAlertsUseCase {
        return {
            execute: async (): Promise<DetectStormAlertsResult> => {
                this.calls += 1;

                if (this.failNext) {
                    this.failNext = false;
                    throw new Error("provider down");
                }

                if (this._gate) {
                    await this._gate;
                }

                return { stormsSeen: 0, alerts: [], sent: 0, skippedAsDuplicate: 0, failed: 0 };
            },
        } as unknown as DetectStormAlertsUseCase;
    }
}
