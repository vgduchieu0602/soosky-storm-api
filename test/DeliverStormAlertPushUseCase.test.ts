import assert from "node:assert/strict";
import test from "node:test";
import PushNotification from "../src/domain/entities/notification/PushNotification.js";
import RegionSubscription from "../src/domain/entities/subscription/RegionSubscription.js";
import StormAlert from "../src/domain/entities/alert/StormAlert.js";
import StormSubscription from "../src/domain/entities/subscription/StormSubscription.js";
import AlertDeliveryRepository from "../src/domain/repositories/alert/IAlertDeliveryRepository.js";
import PushNotificationRepository from "../src/domain/repositories/notification/IPushNotificationRepository.js";
import RegionSubscriptionRepository from "../src/domain/repositories/subscription/IRegionSubscriptionRepository.js";
import StormSubscriptionRepository from "../src/domain/repositories/subscription/IStormSubscriptionRepository.js";
import SendPushNotificationUseCase from "../src/application/use-cases/notification/SendPushNotificationUseCase.js";
import DeliverStormAlertPushUseCase from "../src/application/use-cases/alert/DeliverStormAlertPushUseCase.js";

const FOLLOWER = "a".repeat(64);
const NEARBY = "b".repeat(64);
const FAR_AWAY = "c".repeat(64);
const STORM_ID = "nhc:EP072026";

test("notifies a device following the storm", async () => {
    const world = createWorld({ followers: { [STORM_ID]: [FOLLOWER] } });

    const result = await world.useCase.execute([alert({})]);

    assert.equal(result.sent, 1);
    assert.equal(world.push.sent[0]?.deviceToken, FOLLOWER);
    assert.equal(world.push.sent[0]?.title, "New storm: Genevieve");
});

test("notifies a follower regardless of distance", async () => {
    const world = createWorld({
        followers: { [STORM_ID]: [FOLLOWER] },
        regions: [{ deviceToken: FOLLOWER, lat: -33.87, lon: 151.21, radiusKm: 50 }],
    });

    const result = await world.useCase.execute([alert({})]);

    assert.equal(result.sent, 1);
    assert.equal(world.push.sent[0]?.deviceToken, FOLLOWER);
});

test("notifies a region subscriber inside the radius and no one outside it", async () => {
    const world = createWorld({
        regions: [
            { deviceToken: NEARBY, lat: 22.5, lon: -130, radiusKm: 300 },
            { deviceToken: FAR_AWAY, lat: 10.8, lon: 106.6, radiusKm: 300 },
        ],
    });

    const result = await world.useCase.execute([alert({})]);

    assert.equal(result.sent, 1);
    assert.deepEqual(world.push.sent.map((push) => push.deviceToken), [NEARBY]);
});

test("respects the exact radius boundary", async (context) => {
    await context.test("just inside", async () => {
        const world = createWorld({ regions: [{ deviceToken: NEARBY, lat: 0, lon: 1, radiusKm: 120 }] });

        assert.equal((await world.useCase.execute([alert({ lat: 0, lon: 0 })])).sent, 1);
    });

    await context.test("just outside", async () => {
        const world = createWorld({ regions: [{ deviceToken: NEARBY, lat: 0, lon: 1, radiusKm: 110 }] });

        assert.equal((await world.useCase.execute([alert({ lat: 0, lon: 0 })])).sent, 0);
    });
});

test("re-renders the stored wording with the subscriber's distance", async () => {
    const world = createWorld({ regions: [{ deviceToken: NEARBY, lat: 0, lon: 1, radiusKm: 300 }] });
    const stored = alert({ lat: 0, lon: 0 });

    await world.useCase.execute([stored]);

    assert.equal(stored.description.includes("km from your area"), false, "the record stays neutral");
    assert.match(world.push.sent[0]?.description ?? "", /111 km from your area/);
});

test("omits the distance when the follower saved no region", async () => {
    const world = createWorld({ followers: { [STORM_ID]: [FOLLOWER] } });

    await world.useCase.execute([alert({})]);

    assert.equal(world.push.sent[0]?.description.includes("km from your area"), false);
});

test("sends one notification when a device both follows the storm and is nearby", async () => {
    const world = createWorld({
        followers: { [STORM_ID]: [FOLLOWER] },
        regions: [{ deviceToken: FOLLOWER, lat: 22.5, lon: -130, radiusKm: 500 }],
    });

    const result = await world.useCase.execute([alert({})]);

    assert.equal(result.sent, 1);
    assert.equal(world.push.sent.length, 1);
});

test("never resends the same alert to the same device", async () => {
    const world = createWorld({ followers: { [STORM_ID]: [FOLLOWER] } });
    const stored = alert({});

    await world.useCase.execute([stored]);
    world.push.sent.length = 0;

    const result = await world.useCase.execute([stored]);

    assert.equal(result.sent, 0);
    assert.equal(result.skippedAsDuplicate, 1);
    assert.equal(world.push.sent.length, 0);
});

test("treats each distinct alert as its own claim", async () => {
    const world = createWorld({ followers: { [STORM_ID]: [FOLLOWER] } });

    await world.useCase.execute([
        alert({}),
        alert({ id: STORM_ID + "|category_change|category_2|2026-08-01T03:00:00.000Z", type: "category_change" }),
    ]);

    assert.equal(world.push.sent.length, 2);
    assert.deepEqual([...world.deliveries.claimed], [
        FOLLOWER + "::" + STORM_ID + "|new_storm||2026-07-31T21:00:00.000Z",
        FOLLOWER + "::" + STORM_ID + "|category_change|category_2|2026-08-01T03:00:00.000Z",
    ]);
});

test("one failing delivery does not stop the rest of the batch", async () => {
    const world = createWorld({ followers: { [STORM_ID]: [FOLLOWER, NEARBY] } });

    world.push.failFor = FOLLOWER;

    const result = await world.useCase.execute([alert({})]);

    assert.equal(result.failed, 1);
    assert.equal(result.sent, 1);
    assert.deepEqual(world.push.sent.map((push) => push.deviceToken), [NEARBY]);
});

test("drops the delivery claims of a dissipated storm", async () => {
    const world = createWorld({ followers: { [STORM_ID]: [FOLLOWER] } });

    await world.useCase.execute([alert({ type: "storm_dissipated" })]);

    assert.deepEqual(world.deliveries.removed, [STORM_ID]);
});

test("does nothing at all when there are no alerts", async () => {
    const world = createWorld({ followers: { [STORM_ID]: [FOLLOWER] } });

    const result = await world.useCase.execute([]);

    assert.deepEqual(result, { sent: 0, skippedAsDuplicate: 0, failed: 0 });
    assert.equal(world.push.sent.length, 0);
});

function alert (overrides: Partial<StormAlert>): StormAlert {
    return {
        id: STORM_ID + "|new_storm||2026-07-31T21:00:00.000Z",
        type: "new_storm",
        trackingId: STORM_ID,
        stormId: STORM_ID,
        stormName: "Genevieve",
        previousValue: null,
        currentValue: null,
        lat: 22.3,
        lon: -130.2,
        windSpeed: 50,
        category: null,
        title: "New storm: Genevieve",
        description: "Genevieve formed.",
        observedAt: "2026-07-31T21:00:00.000Z",
        createdAt: "2026-07-31T21:05:00.000Z",
        ...overrides,
    };
}

interface WorldOptions {
    followers?: Record<string, string[]>;
    regions?: RegionSubscription[];
}

function createWorld (options: WorldOptions) {
    const stormSubscriptions = new MemoryStormSubscriptions(options.followers ?? {});
    const regionSubscriptions = new MemoryRegionSubscriptions(options.regions ?? []);
    const deliveries = new MemoryAlertDeliveries();
    const push = new MemoryPushNotifications();
    const useCase = new DeliverStormAlertPushUseCase(
        stormSubscriptions,
        regionSubscriptions,
        deliveries,
        new SendPushNotificationUseCase(push),
        () => undefined,
    );

    return { stormSubscriptions, regionSubscriptions, deliveries, push, useCase };
}

class MemoryStormSubscriptions implements StormSubscriptionRepository {
    public constructor (private readonly _followers: Record<string, string[]>) {}

    public async subscribe (_subscription: StormSubscription): Promise<boolean> {
        return true;
    }

    public async unsubscribe (_subscription: StormSubscription): Promise<boolean> {
        return true;
    }

    public async listDeviceTokensForStorm (trackingId: string): Promise<string[]> {
        return this._followers[trackingId] ?? [];
    }
}

class MemoryRegionSubscriptions implements RegionSubscriptionRepository {
    public constructor (private readonly _regions: RegionSubscription[]) {}

    public async saveRegion (_subscription: RegionSubscription): Promise<void> {
        return undefined;
    }

    public async listRegions (): Promise<RegionSubscription[]> {
        return this._regions;
    }
}

class MemoryAlertDeliveries implements AlertDeliveryRepository {
    public readonly claimed: string[] = [];
    public readonly removed: string[] = [];

    public async claimDelivery (deviceToken: string, alertKey: string): Promise<boolean> {
        const key = deviceToken + "::" + alertKey;

        if (this.claimed.includes(key)) {
            return false;
        }

        this.claimed.push(key);

        return true;
    }

    public async removeDeliveries (trackingId: string): Promise<void> {
        this.removed.push(trackingId);
    }
}

class MemoryPushNotifications implements PushNotificationRepository {
    public readonly sent: PushNotification[] = [];
    public failFor: string | null = null;

    public async sendPushNotification (notification: PushNotification): Promise<void> {
        if (this.failFor === notification.deviceToken) {
            throw new Error("APNs rejected the device token.");
        }

        this.sent.push(notification);
    }
}
