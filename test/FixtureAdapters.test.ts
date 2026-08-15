import assert from "node:assert/strict";
import test from "node:test";
import FixtureDeviceRepository from "../src/adapters/fixture/FixtureDeviceRepository.js";
import FixtureMapTileRepository from "../src/adapters/fixture/FixtureMapTileRepository.js";
import FixturePushNotificationRepository from "../src/adapters/fixture/FixturePushNotificationRepository.js";
import FixtureRadarRepository from "../src/adapters/fixture/FixtureRadarRepository.js";
import FixtureRegionSubscriptionRepository from "../src/adapters/fixture/FixtureRegionSubscriptionRepository.js";
import FixtureStormSubscriptionRepository from "../src/adapters/fixture/FixtureStormSubscriptionRepository.js";

const DEVICE_TOKEN = "a".repeat(64);
const STORM_ID = "gdacs:TC:1001297:51";

test("fixture map tiles are valid, colored PNGs for every layer", async () => {
    const repository = new FixtureMapTileRepository();
    const wind = await repository.getTile({ layer: "windSpeed", z: 3, x: 6, y: 3 });
    const temperature = await repository.getTile({ layer: "temperature", z: 3, x: 6, y: 3 });

    assert.equal(wind.contentType, "image/png");
    assert.deepEqual(wind.buffer.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.equal(wind.buffer.readUInt32BE(16), 256);
    assert.equal(wind.buffer.readUInt32BE(20), 256);
    assert.equal(wind.buffer[25], 6);
    assert.notDeepEqual(wind.buffer, temperature.buffer);
});

test("fixture radar points the frontend to local precipitation tiles", async () => {
    const radar = await new FixtureRadarRepository().getRadar();

    assert.deepEqual(radar, {
        source: "fixture",
        attribution: "Synthetic radar data for testing",
        attributionUrl: "https://soosky.local/fixture-radar",
        host: "",
        tileTemplate: "/v1/map-tiles/precipitation/{z}/{x}/{y}",
        past: [
            { time: "2026-08-08T11:40:00.000Z", path: "/fixture/radar/202608081140" },
            { time: "2026-08-08T11:50:00.000Z", path: "/fixture/radar/202608081150" },
            { time: "2026-08-08T12:00:00.000Z", path: "/fixture/radar/202608081200" },
        ],
        nowcast: [
            { time: "2026-08-08T12:10:00.000Z", path: "/fixture/radar/202608081210" },
            { time: "2026-08-08T12:20:00.000Z", path: "/fixture/radar/202608081220" },
        ],
        generatedAt: "2026-08-08T12:00:00.000Z",
        cachedUntil: null,
    });
});

test("fixture push notifications do not need APNs credentials", async () => {
    await assert.doesNotReject(new FixturePushNotificationRepository().sendPushNotification({
        deviceToken: DEVICE_TOKEN,
        title: "Fixture alert",
        description: "No external notification was sent.",
        stormId: "nhc:EP072026",
        type: "new_storm",
    }));
});

test("fixture device and subscription storage keeps client flows idempotent", async () => {
    const devices = new FixtureDeviceRepository();
    const subscriptions = new FixtureStormSubscriptionRepository();

    assert.equal(await devices.registerDevice({ deviceToken: DEVICE_TOKEN }), true);
    assert.equal(await devices.registerDevice({ deviceToken: DEVICE_TOKEN }), false);
    assert.equal(await subscriptions.subscribe({ deviceToken: DEVICE_TOKEN, stormId: STORM_ID }), true);
    assert.equal(await subscriptions.subscribe({ deviceToken: DEVICE_TOKEN, stormId: STORM_ID }), false);
    assert.deepEqual(await subscriptions.listDeviceTokensForStorm("gdacs:TC:1001297"), [DEVICE_TOKEN]);
    assert.equal(await subscriptions.unsubscribe({ deviceToken: DEVICE_TOKEN, stormId: STORM_ID }), true);
    assert.equal(await subscriptions.unsubscribe({ deviceToken: DEVICE_TOKEN, stormId: STORM_ID }), false);
});

test("fixture region storage replaces a device's previous region", async () => {
    const regions = new FixtureRegionSubscriptionRepository();

    await regions.saveRegion({ deviceToken: DEVICE_TOKEN, lat: 10.8231, lon: 106.6297, radiusKm: 300 });
    await regions.saveRegion({ deviceToken: DEVICE_TOKEN, lat: 21.0285, lon: 105.8542, radiusKm: 150 });

    assert.deepEqual(await regions.listRegions(), [{
        deviceToken: DEVICE_TOKEN,
        lat: 21.0285,
        lon: 105.8542,
        radiusKm: 150,
    }]);
});
