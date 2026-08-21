import assert from "node:assert/strict";
import test from "node:test";
import StormAlert from "../src/domain/entities/alert/StormAlert.js";
import MongoStormAlertRepository from "../src/adapters/mongo/MongoStormAlertRepository.js";
import { AlertCollection } from "../src/adapters/mongo/runMongoOperation.js";

test("records new alerts and reports how many were written", async () => {
    const collection = new FakeAlertCollection();
    const repository = new MongoStormAlertRepository(collection, () => true);

    const saved = await repository.saveAlerts([alert({}), alert({ id: "second" })]);

    assert.equal(saved, 2);
    assert.equal(collection.inserted.length, 2);
    assert.equal(collection.inserted[0]?._id, "first");
    assert.equal(collection.lastOptions?.ordered, false, "one stored alert must not stop the batch");
});

test("writes nothing and touches no collection for an empty batch", async () => {
    const collection = new FakeAlertCollection();
    const repository = new MongoStormAlertRepository(collection, () => false);

    assert.equal(await repository.saveAlerts([]), 0);
    assert.equal(collection.inserted.length, 0);
});

test("treats an already-recorded alert as success, not failure", async () => {
    const collection = new FakeAlertCollection();

    collection.failWith = duplicateKeyError();

    const repository = new MongoStormAlertRepository(collection, () => true);

    assert.equal(await repository.saveAlerts([alert({})]), 0);
});

test("still reports a real storage failure", async () => {
    const collection = new FakeAlertCollection();

    collection.failWith = new Error("connection reset");

    const repository = new MongoStormAlertRepository(collection, () => true);

    await assert.rejects(() => repository.saveAlerts([alert({})]), /storage request could not be completed/);
});

test("reads the tracked storms newest first", async () => {
    const collection = new FakeAlertCollection();

    collection.documents = [{
        _id: "first",
        trackingId: "nhc:AL012026",
        stormId: "nhc:AL012026",
        stormName: "ANDREW",
        type: "category_change",
        previousValue: "category_1",
        currentValue: "category_2",
        lat: 12.6,
        lon: -45.8,
        windSpeed: 90,
        category: "category_2",
        title: "ANDREW strengthened",
        description: "ANDREW strengthened from Category 1 to Category 2.",
        observedAt: "2026-08-08T06:00:00.000Z",
        createdAt: new Date("2026-08-08T06:04:00.000Z"),
    }];

    const repository = new MongoStormAlertRepository(collection, () => true);
    const alerts = await repository.listAlertsByTrackingIds(["nhc:AL012026"], 20);

    assert.deepEqual(collection.lastFilter, { trackingId: { $in: ["nhc:AL012026"] } });
    assert.deepEqual(collection.lastSort, { createdAt: -1 });
    assert.equal(collection.lastLimit, 20);
    assert.equal(alerts[0]?.id, "first");
    assert.equal(alerts[0]?.previousValue, "category_1");
    assert.equal(alerts[0]?.createdAt, "2026-08-08T06:04:00.000Z");
});

test("does not query at all for an empty storm list", async () => {
    const collection = new FakeAlertCollection();
    const repository = new MongoStormAlertRepository(collection, () => false);

    assert.deepEqual(await repository.listAlertsByTrackingIds([], 20), []);
    assert.equal(collection.lastFilter, null);
});

test("refuses to read while the database is unreachable", async () => {
    const repository = new MongoStormAlertRepository(new FakeAlertCollection(), () => false);

    await assert.rejects(
        () => repository.listAlertsByTrackingIds(["nhc:AL012026"], 20),
        /Storage is temporarily unavailable/,
    );
});

function alert (overrides: Partial<StormAlert>): StormAlert {
    return {
        id: "first",
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
        ...overrides,
    };
}

function duplicateKeyError (): Error {
    const error = new Error("E11000 duplicate key error collection: storm_alerts");

    (error as unknown as { code: number }).code = 11000;

    return error;
}

class FakeAlertCollection implements AlertCollection {
    public readonly inserted: Record<string, unknown>[] = [];
    public documents: Record<string, unknown>[] = [];
    public failWith: Error | null = null;
    public lastOptions: { ordered: false } | null = null;
    public lastFilter: Record<string, unknown> | null = null;
    public lastSort: Record<string, 1 | -1> | null = null;
    public lastLimit: number | null = null;

    public async insertMany (
        documents: Record<string, unknown>[],
        options: { ordered: false },
    ): Promise<unknown[]> {
        this.lastOptions = options;

        if (this.failWith) {
            throw this.failWith;
        }

        this.inserted.push(...documents);

        return documents;
    }

    public find (filter: Record<string, unknown>) {
        this.lastFilter = filter;

        return {
            sort: (spec: Record<string, 1 | -1>) => {
                this.lastSort = spec;

                return {
                    limit: (count: number) => {
                        this.lastLimit = count;

                        return { lean: async () => this.documents };
                    },
                };
            },
        };
    }
}
