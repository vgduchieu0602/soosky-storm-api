import assert from "node:assert/strict";
import test from "node:test";
import StormAlert from "../src/domain/entities/alert/StormAlert.js";
import StormAlertRepository from "../src/domain/repositories/alert/IStormAlertRepository.js";
import GetStormAlertsUseCase from "../src/application/use-cases/alert/GetStormAlertsUseCase.js";

test("asks for the storms the caller is tracking", async () => {
    const repository = new RecordingStormAlerts();
    const useCase = new GetStormAlertsUseCase(repository);

    await useCase.execute({ stormIds: ["nhc:AL012026", "nhc:AL022026"] });

    assert.deepEqual(repository.lastTrackingIds, ["nhc:AL012026", "nhc:AL022026"]);
});

test("strips the GDACS episode so a tracked storm actually matches its alerts", async () => {
    const repository = new RecordingStormAlerts();
    const useCase = new GetStormAlertsUseCase(repository);

    await useCase.execute({ stormIds: ["gdacs:TC:123456:1"] });

    assert.deepEqual(repository.lastTrackingIds, ["gdacs:TC:123456"]);
});

test("collapses two episodes of one storm into a single lookup", async () => {
    const repository = new RecordingStormAlerts();
    const useCase = new GetStormAlertsUseCase(repository);

    await useCase.execute({ stormIds: ["gdacs:TC:123456:1", "gdacs:TC:123456:3"] });

    assert.deepEqual(repository.lastTrackingIds, ["gdacs:TC:123456"]);
});

test("defaults to fifty alerts and never exceeds two hundred", async () => {
    const repository = new RecordingStormAlerts();
    const useCase = new GetStormAlertsUseCase(repository);

    await useCase.execute({ stormIds: ["nhc:AL012026"] });
    assert.equal(repository.lastLimit, 50);

    await useCase.execute({ stormIds: ["nhc:AL012026"], limit: 5 });
    assert.equal(repository.lastLimit, 5);

    await useCase.execute({ stormIds: ["nhc:AL012026"], limit: 5_000 });
    assert.equal(repository.lastLimit, 200);
});

test("returns whatever the repository holds for those storms", async () => {
    const repository = new RecordingStormAlerts();

    repository.alerts = [alert()];

    const useCase = new GetStormAlertsUseCase(repository);
    const found = await useCase.execute({ stormIds: ["nhc:AL012026"] });

    assert.equal(found.length, 1);
    assert.equal(found[0]?.stormName, "ANDREW");
});

function alert (): StormAlert {
    return {
        id: "nhc:AL012026|new_storm||2026-08-08T06:00:00.000Z",
        type: "new_storm",
        trackingId: "nhc:AL012026",
        stormId: "nhc:AL012026",
        stormName: "ANDREW",
        previousValue: null,
        currentValue: null,
        lat: 12.6,
        lon: -45.8,
        windSpeed: 30,
        category: null,
        title: "New storm: ANDREW",
        description: "ANDREW formed.",
        observedAt: "2026-08-08T06:00:00.000Z",
        createdAt: "2026-08-08T06:03:00.000Z",
    };
}

class RecordingStormAlerts implements StormAlertRepository {
    public alerts: StormAlert[] = [];
    public lastTrackingIds: string[] | null = null;
    public lastLimit: number | null = null;

    public async saveAlerts (alerts: StormAlert[]): Promise<number> {
        return alerts.length;
    }

    public async listAlertsByTrackingIds (trackingIds: string[], limit: number): Promise<StormAlert[]> {
        this.lastTrackingIds = trackingIds;
        this.lastLimit = limit;

        return this.alerts;
    }
}
