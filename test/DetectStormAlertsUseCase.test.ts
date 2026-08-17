import assert from "node:assert/strict";
import test from "node:test";
import PushNotification from "../src/domain/entities/PushNotification.js";
import RegionSubscription from "../src/domain/entities/RegionSubscription.js";
import StormState from "../src/domain/entities/StormState.js";
import StormSummary, { StormCategory } from "../src/domain/entities/StormSummary.js";
import StormSubscription from "../src/domain/entities/StormSubscription.js";
import ActiveStormsRepository from "../src/domain/repositories/IActiveStormsRepository.js";
import AlertDeliveryRepository from "../src/domain/repositories/IAlertDeliveryRepository.js";
import PushNotificationRepository from "../src/domain/repositories/IPushNotificationRepository.js";
import RegionSubscriptionRepository from "../src/domain/repositories/IRegionSubscriptionRepository.js";
import StormStateRepository from "../src/domain/repositories/IStormStateRepository.js";
import StormSubscriptionRepository from "../src/domain/repositories/IStormSubscriptionRepository.js";
import SendPushNotificationUseCase from "../src/domain/use-cases/notification/SendPushNotificationUseCase.js";
import DetectStormAlertsUseCase from "../src/domain/use-cases/alert/DetectStormAlertsUseCase.js";

const FOLLOWER = "a".repeat(64);
const NEARBY = "b".repeat(64);
const FAR_AWAY = "c".repeat(64);
const STORM_ID = "nhc:EP072026";

test("detects a new storm and notifies a device following it", async () => {
    const world = createWorld({ storms: [storm({})], followers: { [STORM_ID]: [FOLLOWER] } });

    const result = await world.useCase.execute();

    assert.deepEqual(result.alerts.map((alert) => alert.type), ["new_storm"]);
    assert.equal(result.sent, 1);
    assert.equal(world.push.sent[0]?.deviceToken, FOLLOWER);
    assert.equal(world.push.sent[0]?.title, "New storm: Genevieve");
});

test("raises no alert when nothing about the storm changed", async () => {
    const world = createWorld({ storms: [storm({})], followers: { [STORM_ID]: [FOLLOWER] } });

    await world.useCase.execute();
    world.push.sent.length = 0;
    const second = await world.useCase.execute();

    assert.deepEqual(second.alerts, []);
    assert.equal(world.push.sent.length, 0);
});

test("detects a category change and describes the new winds", async () => {
    const world = createWorld({ storms: [storm({})], followers: { [STORM_ID]: [FOLLOWER] } });

    await world.useCase.execute();
    world.push.sent.length = 0;
    world.storms.storms = [storm({ windSpeed: 90, category: "category_2" })];

    const result = await world.useCase.execute();

    assert.deepEqual(result.alerts.map((alert) => alert.type), ["category_change"]);
    assert.equal(world.push.sent[0]?.title, "Genevieve is now a Category 2 hurricane");
    assert.match(world.push.sent[0]?.description ?? "", /Winds now at 167 km\/h/);
});

test("appends the deterministic safety message for Category 1-5", async () => {
    const world = createWorld({ storms: [storm({})], followers: { [STORM_ID]: [FOLLOWER] } });
    const examples = [
        ["category_1", 70, "Secure loose items, check emergency supplies now"],
        ["category_2", 90, "Review evacuation route. Power outages likely"],
        ["category_3", 105, "Major hurricane. Follow evacuation orders if issued"],
        ["category_4", 120, "Catastrophic winds. Evacuate now if advised."],
        ["category_5", 140, "Extreme danger. Leave immediately if ordered."],
    ] as const;

    await world.useCase.execute();

    for (const [category, windSpeed, expectedMessage] of examples) {
        world.storms.storms = [storm({ windSpeed, category })];
        world.push.sent.length = 0;

        await world.useCase.execute();

        assert.match(world.push.sent[0]?.description ?? "", new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
});

test("detects a track change only after the heading turns far enough", async () => {
    const world = createWorld({ storms: [storm({})], followers: { [STORM_ID]: [FOLLOWER] } });

    await world.useCase.execute();
    // Establish a westward heading first, so a bearing exists to compare against.
    world.storms.storms = [storm({ lon: -131.2 })];
    await world.useCase.execute();
    world.push.sent.length = 0;

    // Keep heading west: no course change.
    world.storms.storms = [storm({ lon: -132.2 })];
    const straight = await world.useCase.execute();

    assert.deepEqual(straight.alerts.map((alert) => alert.type), []);

    // Turn hard north.
    world.storms.storms = [storm({ lon: -132.2, lat: 24.3 })];
    const turned = await world.useCase.execute();

    assert.deepEqual(turned.alerts.map((alert) => alert.type), ["track_change"]);
    assert.equal(world.push.sent[0]?.title, "Genevieve changed course");
    assert.match(world.push.sent[0]?.description ?? "", /New heading: N/);
});

test("ignores jitter below the movement threshold", async () => {
    const world = createWorld({ storms: [storm({})], followers: { [STORM_ID]: [FOLLOWER] } });

    await world.useCase.execute();
    world.storms.storms = [storm({ lon: -131.2 })];
    await world.useCase.execute();
    world.push.sent.length = 0;

    world.storms.storms = [storm({ lon: -131.21, lat: 22.31 })];
    const result = await world.useCase.execute();

    assert.deepEqual(result.alerts, []);
});

test("detects a GDACS alert level change", async () => {
    const gdacsStorm = storm({ stormId: "gdacs:TC:1001297:51", alertLevel: "Orange" });
    const world = createWorld({
        storms: [gdacsStorm],
        followers: { "gdacs:TC:1001297": [FOLLOWER] },
    });

    await world.useCase.execute();
    world.push.sent.length = 0;
    world.storms.storms = [{ ...gdacsStorm, alertLevel: "Red" }];

    const result = await world.useCase.execute();

    assert.deepEqual(result.alerts.map((alert) => alert.type), ["alert_level_change"]);
    assert.equal(world.push.sent[0]?.title, "Genevieve alert level: Red");
});

test("detects a watch or warning change", async () => {
    const world = createWorld({ storms: [storm({ watchWarning: "Tropical Storm Watch" })], followers: { [STORM_ID]: [FOLLOWER] } });

    await world.useCase.execute();
    world.push.sent.length = 0;
    world.storms.storms = [storm({ watchWarning: "Hurricane Warning" })];

    const result = await world.useCase.execute();

    assert.deepEqual(result.alerts.map((alert) => alert.type), ["watch_warning"]);
    assert.equal(world.push.sent[0]?.title, "Genevieve watch/warning updated");
    assert.match(world.push.sent[0]?.description ?? "", /Hurricane Warning/);
    assert.equal(world.push.sent[0]?.stormId, STORM_ID);
    assert.equal(world.push.sent[0]?.type, "watch_warning");
    assert.deepEqual(world.push.sent[0]?.data, { trackingId: STORM_ID });
});

test("detects a dissipated storm and clears its stored state", async () => {
    const world = createWorld({ storms: [storm({})], followers: { [STORM_ID]: [FOLLOWER] } });

    await world.useCase.execute();
    world.push.sent.length = 0;
    world.storms.storms = [];

    const result = await world.useCase.execute();

    assert.deepEqual(result.alerts.map((alert) => alert.type), ["storm_dissipated"]);
    assert.equal(world.push.sent[0]?.title, "Genevieve has dissipated");
    assert.equal(world.push.sent[0]?.description, "No longer an active threat to your area.");
    assert.deepEqual(await world.states.listStates(), []);
    assert.deepEqual(world.deliveries.removed, [STORM_ID]);
});

test("notifies a follower regardless of distance", async () => {
    const world = createWorld({
        storms: [storm({})],
        followers: { [STORM_ID]: [FOLLOWER] },
        regions: [{ deviceToken: FOLLOWER, lat: -33.87, lon: 151.21, radiusKm: 50 }],
    });

    const result = await world.useCase.execute();

    assert.equal(result.sent, 1);
    assert.equal(world.push.sent[0]?.deviceToken, FOLLOWER);
});

test("notifies a region subscriber inside the radius and no one outside it", async () => {
    const world = createWorld({
        storms: [storm({})],
        regions: [
            { deviceToken: NEARBY, lat: 22.5, lon: -130, radiusKm: 300 },
            { deviceToken: FAR_AWAY, lat: 10.8, lon: 106.6, radiusKm: 300 },
        ],
    });

    const result = await world.useCase.execute();

    assert.equal(result.sent, 1);
    assert.deepEqual(world.push.sent.map((push) => push.deviceToken), [NEARBY]);
});

test("respects the exact radius boundary", async (context) => {
    await context.test("just inside", async () => {
        const world = createWorld({
            storms: [storm({ lat: 0, lon: 0 })],
            regions: [{ deviceToken: NEARBY, lat: 0, lon: 1, radiusKm: 120 }],
        });

        assert.equal((await world.useCase.execute()).sent, 1);
    });

    await context.test("just outside", async () => {
        const world = createWorld({
            storms: [storm({ lat: 0, lon: 0 })],
            regions: [{ deviceToken: NEARBY, lat: 0, lon: 1, radiusKm: 110 }],
        });

        assert.equal((await world.useCase.execute()).sent, 0);
    });
});

test("includes the distance from a subscriber's saved region in the message", async () => {
    const world = createWorld({
        storms: [storm({ lat: 0, lon: 0 })],
        regions: [{ deviceToken: NEARBY, lat: 0, lon: 1, radiusKm: 300 }],
    });

    await world.useCase.execute();

    assert.match(world.push.sent[0]?.description ?? "", /111 km from your area/);
});

test("omits the distance when the follower saved no region", async () => {
    const world = createWorld({ storms: [storm({})], followers: { [STORM_ID]: [FOLLOWER] } });

    await world.useCase.execute();

    assert.equal(world.push.sent[0]?.description.includes("km from your area"), false);
});

test("sends one notification when a device both follows the storm and is nearby", async () => {
    const world = createWorld({
        storms: [storm({})],
        followers: { [STORM_ID]: [FOLLOWER] },
        regions: [{ deviceToken: FOLLOWER, lat: 22.5, lon: -130, radiusKm: 500 }],
    });

    const result = await world.useCase.execute();

    assert.equal(result.sent, 1);
    assert.equal(world.push.sent.length, 1);
});

test("never resends the same alert to the same device", async () => {
    const world = createWorld({ storms: [storm({})], followers: { [STORM_ID]: [FOLLOWER] } });

    await world.useCase.execute();
    world.push.sent.length = 0;
    // The stored state is discarded, so detection sees the storm as new again.
    world.states.states.clear();

    const result = await world.useCase.execute();

    assert.deepEqual(result.alerts.map((alert) => alert.type), ["new_storm"]);
    assert.equal(result.sent, 0);
    assert.equal(result.skippedAsDuplicate, 1);
    assert.equal(world.push.sent.length, 0);
});

test("treats each distinct change as its own alert for duplicate purposes", async () => {
    const world = createWorld({ storms: [storm({})], followers: { [STORM_ID]: [FOLLOWER] } });

    await world.useCase.execute();
    world.storms.storms = [storm({ windSpeed: 90, category: "category_2" })];
    await world.useCase.execute();
    world.storms.storms = [storm({ windSpeed: 120, category: "category_4" })];
    await world.useCase.execute();

    assert.deepEqual(world.push.sent.map((push) => push.title), [
        "New storm: Genevieve",
        "Genevieve is now a Category 2 hurricane",
        "Genevieve is now a Category 4 hurricane",
    ]);
    assert.deepEqual([...world.deliveries.claimed], [
        FOLLOWER + "::" + STORM_ID + "|new_storm|",
        FOLLOWER + "::" + STORM_ID + "|category_change|category_2",
        FOLLOWER + "::" + STORM_ID + "|category_change|category_4",
    ]);
});

test("one failing delivery does not stop the rest of the cycle", async () => {
    const world = createWorld({
        storms: [storm({})],
        followers: { [STORM_ID]: [FOLLOWER, NEARBY] },
    });

    world.push.failFor = FOLLOWER;

    const result = await world.useCase.execute();

    assert.equal(result.failed, 1);
    assert.equal(result.sent, 1);
    assert.deepEqual(world.push.sent.map((push) => push.deviceToken), [NEARBY]);
});

test("treats a GDACS episode bump as the same storm, not a new one", async () => {
    const episode51 = storm({ stormId: "gdacs:TC:1001297:51", name: "DOLPHIN-26", alertLevel: "Orange" });
    const world = createWorld({
        storms: [episode51],
        followers: { "gdacs:TC:1001297": [FOLLOWER] },
    });

    const first = await world.useCase.execute();

    assert.deepEqual(first.alerts.map((alert) => alert.type), ["new_storm"]);
    world.push.sent.length = 0;

    // GDACS republishes the same event under a new episode ID.
    world.storms.storms = [{ ...episode51, stormId: "gdacs:TC:1001297:53" }];

    const second = await world.useCase.execute();

    assert.deepEqual(second.alerts, [], "an episode bump alone must raise no alert");
    assert.equal(world.push.sent.length, 0);
    assert.equal((await world.states.listStates()).length, 1, "the storm must occupy one state row");
    assert.equal((await world.states.listStates())[0]?.stormId, "gdacs:TC:1001297:53");
});

test("still notifies a follower after the storm's episode ID changes", async () => {
    const world = createWorld({
        storms: [storm({ stormId: "gdacs:TC:1001297:51", alertLevel: "Orange" })],
        followers: { "gdacs:TC:1001297": [FOLLOWER] },
    });

    await world.useCase.execute();
    world.push.sent.length = 0;
    world.storms.storms = [storm({
        stormId: "gdacs:TC:1001297:53",
        alertLevel: "Red",
        windSpeed: 90,
        category: "category_2",
    })];

    const result = await world.useCase.execute();

    assert.deepEqual(
        result.alerts.map((alert) => alert.type).sort(),
        ["alert_level_change", "category_change"],
    );
    assert.equal(result.sent, 2);
    assert.deepEqual(world.push.sent.map((push) => push.deviceToken), [FOLLOWER, FOLLOWER]);
});

test("stores the storm state even when there are no subscribers", async () => {
    const world = createWorld({ storms: [storm({})] });

    const result = await world.useCase.execute();

    assert.equal(result.alerts.length, 1);
    assert.equal(result.sent, 0);
    assert.equal((await world.states.listStates()).length, 1);
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
    followers?: Record<string, string[]>;
    regions?: RegionSubscription[];
}

function createWorld (options: WorldOptions) {
    const storms = new MemoryActiveStorms(options.storms);
    const states = new MemoryStormStates();
    const stormSubscriptions = new MemoryStormSubscriptions(options.followers ?? {});
    const regionSubscriptions = new MemoryRegionSubscriptions(options.regions ?? []);
    const deliveries = new MemoryAlertDeliveries();
    const push = new MemoryPushNotifications();
    const useCase = new DetectStormAlertsUseCase(
        storms,
        states,
        stormSubscriptions,
        regionSubscriptions,
        deliveries,
        new SendPushNotificationUseCase(push),
        () => undefined,
    );

    return { storms, states, stormSubscriptions, regionSubscriptions, deliveries, push, useCase };
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

    public async removeDeliveries (stormId: string): Promise<void> {
        this.removed.push(stormId);
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
