import assert from "node:assert/strict";
import test from "node:test";
import MongoDeviceRepository from "../src/adapters/mongo/MongoDeviceRepository.js";
import MongoRegionSubscriptionRepository from "../src/adapters/mongo/MongoRegionSubscriptionRepository.js";
import MongoStormSubscriptionRepository from "../src/adapters/mongo/MongoStormSubscriptionRepository.js";
import StorageUnavailableError from "../src/domain/errors/StorageUnavailableError.js";

const DEVICE_TOKEN = "a".repeat(64);
const STORM_ID = "nhc:EP072026";

interface RecordedUpdate {
    filter: Record<string, unknown>;
    update: Record<string, unknown>;
    options: { upsert: true };
}

test("device repository upserts on the device token and reports a first registration", async () => {
    const updates: RecordedUpdate[] = [];
    const repository = new MongoDeviceRepository(
        createUpsertCollection(updates, { upsertedCount: 1 }),
        () => true,
    );

    assert.equal(await repository.registerDevice({ deviceToken: DEVICE_TOKEN }), true);
    assert.deepEqual(updates, [{
        filter: { deviceToken: DEVICE_TOKEN },
        update: { $setOnInsert: { deviceToken: DEVICE_TOKEN } },
        options: { upsert: true },
    }]);
});

test("device repository reports a repeat registration without creating a duplicate", async () => {
    const updates: RecordedUpdate[] = [];
    const repository = new MongoDeviceRepository(
        createUpsertCollection(updates, { upsertedCount: 0 }),
        () => true,
    );

    assert.equal(await repository.registerDevice({ deviceToken: DEVICE_TOKEN }), false);
    assert.equal(updates.length, 1);
});

test("device repository treats a unique-index race as an existing registration", async () => {
    const repository = new MongoDeviceRepository({
        updateOne: () => Promise.reject(duplicateKeyError()),
    }, () => true);

    assert.equal(await repository.registerDevice({ deviceToken: DEVICE_TOKEN }), false);
});

test("storm subscription repository upserts the device and storm pair", async () => {
    const updates: RecordedUpdate[] = [];
    const repository = new MongoStormSubscriptionRepository(
        { ...createUpsertCollection(updates, { upsertedCount: 1 }), deleteOne: () => Promise.resolve({ deletedCount: 0 }) },
        () => true,
    );

    assert.equal(await repository.subscribe({ deviceToken: DEVICE_TOKEN, stormId: STORM_ID }), true);
    assert.deepEqual(updates, [{
        filter: { deviceToken: DEVICE_TOKEN, stormId: STORM_ID },
        update: { $setOnInsert: { deviceToken: DEVICE_TOKEN, stormId: STORM_ID, trackingId: STORM_ID } },
        options: { upsert: true },
    }]);
});

test("storm subscription repository reports a repeat subscribe as already subscribed", async (context) => {
    await context.test("matched an existing row", async () => {
        const repository = new MongoStormSubscriptionRepository({
            updateOne: () => Promise.resolve({ upsertedCount: 0 }),
            deleteOne: () => Promise.resolve({ deletedCount: 0 }),
        }, () => true);

        assert.equal(await repository.subscribe({ deviceToken: DEVICE_TOKEN, stormId: STORM_ID }), false);
    });

    await context.test("lost the unique-index race", async () => {
        const repository = new MongoStormSubscriptionRepository({
            updateOne: () => Promise.reject(duplicateKeyError()),
            deleteOne: () => Promise.resolve({ deletedCount: 0 }),
        }, () => true);

        assert.equal(await repository.subscribe({ deviceToken: DEVICE_TOKEN, stormId: STORM_ID }), false);
    });
});

test("storm subscription repository deletes only the requested pair", async () => {
    const filters: Record<string, unknown>[] = [];
    const repository = new MongoStormSubscriptionRepository({
        updateOne: () => Promise.resolve({ upsertedCount: 0 }),
        deleteOne: (filter) => {
            filters.push(filter);
            return Promise.resolve({ deletedCount: 1 });
        },
    }, () => true);

    assert.equal(await repository.unsubscribe({ deviceToken: DEVICE_TOKEN, stormId: STORM_ID }), true);
    assert.deepEqual(filters, [{ deviceToken: DEVICE_TOKEN, stormId: STORM_ID }]);
});

test("storm subscription repository reports nothing removed for an absent subscription", async () => {
    const repository = new MongoStormSubscriptionRepository({
        updateOne: () => Promise.resolve({ upsertedCount: 0 }),
        deleteOne: () => Promise.resolve({ deletedCount: 0 }),
    }, () => true);

    assert.equal(await repository.unsubscribe({ deviceToken: DEVICE_TOKEN, stormId: STORM_ID }), false);
});

test("region subscription repository replaces the stored region for a device", async () => {
    const updates: RecordedUpdate[] = [];
    const repository = new MongoRegionSubscriptionRepository(
        createUpsertCollection(updates, { upsertedCount: 1 }),
        () => true,
    );

    await repository.saveRegion({ deviceToken: DEVICE_TOKEN, lat: 10.8231, lon: 106.6297, radiusKm: 300 });
    await repository.saveRegion({ deviceToken: DEVICE_TOKEN, lat: 21.03, lon: 105.85, radiusKm: 150 });

    assert.equal(updates.length, 2);
    assert.deepEqual(updates[1], {
        filter: { deviceToken: DEVICE_TOKEN },
        update: {
            $set: { lat: 21.03, lon: 105.85, radiusKm: 150 },
            $setOnInsert: { deviceToken: DEVICE_TOKEN },
        },
        options: { upsert: true },
    });
});

test("subscription repositories refuse to run while the database is disconnected", async (context) => {
    await context.test("device registration", async () => {
        const repository = new MongoDeviceRepository({
            updateOne: () => Promise.reject(new Error("must not be called")),
        }, () => false);

        await assert.rejects(repository.registerDevice({ deviceToken: DEVICE_TOKEN }), StorageUnavailableError);
    });

    await context.test("storm subscribe", async () => {
        const repository = new MongoStormSubscriptionRepository({
            updateOne: () => Promise.reject(new Error("must not be called")),
            deleteOne: () => Promise.reject(new Error("must not be called")),
        }, () => false);

        await assert.rejects(
            repository.subscribe({ deviceToken: DEVICE_TOKEN, stormId: STORM_ID }),
            StorageUnavailableError,
        );
        await assert.rejects(
            repository.unsubscribe({ deviceToken: DEVICE_TOKEN, stormId: STORM_ID }),
            StorageUnavailableError,
        );
    });

    await context.test("region save", async () => {
        const repository = new MongoRegionSubscriptionRepository({
            updateOne: () => Promise.reject(new Error("must not be called")),
        }, () => false);

        await assert.rejects(
            repository.saveRegion({ deviceToken: DEVICE_TOKEN, lat: 10, lon: 106, radiusKm: 100 }),
            StorageUnavailableError,
        );
    });
});

test("subscription repositories wrap driver failures as storage errors", async () => {
    const repository = new MongoRegionSubscriptionRepository({
        updateOne: () => Promise.reject(new Error("connection reset")),
    }, () => true);

    await assert.rejects(
        repository.saveRegion({ deviceToken: DEVICE_TOKEN, lat: 10, lon: 106, radiusKm: 100 }),
        StorageUnavailableError,
    );
});

function createUpsertCollection (recorded: RecordedUpdate[], outcome: { upsertedCount: number }) {
    return {
        updateOne (
            filter: Record<string, unknown>,
            update: Record<string, unknown>,
            options: { upsert: true },
        ) {
            recorded.push({ filter, update, options });

            return Promise.resolve(outcome);
        },
    };
}

function duplicateKeyError (): Error {
    return Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
}
