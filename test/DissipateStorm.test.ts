import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import test from "node:test";

import Server from "../src/http/Server.js";
import RateLimiter from "../src/http/RateLimiter.js";
import DetectStormAlertsUseCase from "../src/domain/use-cases/alert/DetectStormAlertsUseCase.js";
import SendPushNotificationUseCase from "../src/domain/use-cases/notification/SendPushNotificationUseCase.js";
import GetTrackedStormsUseCase from "../src/domain/use-cases/storm/GetTrackedStormsUseCase.js";
import TestableActiveStormsRepository from "../src/adapters/storm/TestableActiveStormsRepository.js";

import StormSummary from "../src/domain/entities/storm/StormSummary.js";
import StormState from "../src/domain/entities/alert/StormState.js";
import HistoricalStormTrack from "../src/domain/entities/storm/HistoricalStormTrack.js";
import RegionSubscription from "../src/domain/entities/subscription/RegionSubscription.js";

import ActiveStormsRepository from "../src/domain/repositories/storm/IActiveStormsRepository.js";
import StormStateRepository from "../src/domain/repositories/alert/IStormStateRepository.js";
import StormSubscriptionRepository from "../src/domain/repositories/subscription/IStormSubscriptionRepository.js";
import RegionSubscriptionRepository from "../src/domain/repositories/subscription/IRegionSubscriptionRepository.js";
import AlertDeliveryRepository from "../src/domain/repositories/alert/IAlertDeliveryRepository.js";
import PushNotificationRepository from "../src/domain/repositories/notification/IPushNotificationRepository.js";
import HistoricalStormTrackRepository from "../src/domain/repositories/storm/IHistoricalStormTrackRepository.js";

import type { ServerUseCases } from "../src/http/Server.js";

const STORM_ID = "nhc:AL032026";

const ACTIVE_STORM: StormSummary = {
    stormId: STORM_ID,
    name: "HURRICANE CHARLIE",
    source: "nhc",
    basin: "north_atlantic",
    lat: 25.1,
    lon: -68.3,
    datetime: "2026-08-08T12:00:00.000Z",
    windSpeed: 75,
    category: "category_1",
    alertLevel: null,
    watchWarning: "Hurricane watch for the northern Leeward Islands.",
};

// Previous snapshot the alert detector would have stored on an earlier poll.
// Required before /dissipate can run (otherwise 409 STORM_NOT_READY_FOR_DISSIPATION_TEST).
const SEED_STATE: StormState = {
    trackingId: STORM_ID,
    stormId: STORM_ID,
    name: "HURRICANE CHARLIE",
    lat: 25.1,
    lon: -68.3,
    windSpeed: 75,
    category: "category_1",
    alertLevel: null,
    watchWarning: null,
    bearing: null,
};

// --- In-memory fakes ---------------------------------------------------------

class MemoryStormStateRepository implements StormStateRepository {
    private _states: StormState[];

    public constructor (states: StormState[]) {
        this._states = states.map((state) => ({ ...state }));
    }

    public async listStates (): Promise<StormState[]> {
        return this._states.map((state) => ({ ...state }));
    }

    public async saveState (state: StormState): Promise<void> {
        const index = this._states.findIndex((s) => s.trackingId === state.trackingId);

        if (index >= 0) {
            this._states[index] = { ...state };
        } else {
            this._states.push({ ...state });
        }
    }

    public async removeState (trackingId: string): Promise<void> {
        this._states = this._states.filter((s) => s.trackingId !== trackingId);
    }
}

class FakeActiveStormsRepository implements ActiveStormsRepository {
    public constructor (private readonly _storm: StormSummary | null) {}

    public async getActiveStorms (): Promise<StormSummary[]> {
        return this._storm ? [{ ...this._storm }] : [];
    }
}

class FakeHistoricalStormTrackRepository implements HistoricalStormTrackRepository {
    public async getHistoricalStormTrack (stormId: string): Promise<HistoricalStormTrack> {
        return {
            stormId,
            name: ACTIVE_STORM.name,
            source: "nhc",
            trackKind: "best_track",
            cachedUntil: null,
            availability: "available",
            history: [{
                lat: ACTIVE_STORM.lat,
                lon: ACTIVE_STORM.lon,
                datetime: ACTIVE_STORM.datetime,
                windSpeed: ACTIVE_STORM.windSpeed,
                category: ACTIVE_STORM.category,
            }],
        };
    }
}

class NoopStormSubscriptionRepository implements StormSubscriptionRepository {
    public async subscribe (): Promise<boolean> { return true; }
    public async unsubscribe (): Promise<boolean> { return true; }
    public async listDeviceTokensForStorm (): Promise<string[]> { return []; }
}

class NoopRegionSubscriptionRepository implements RegionSubscriptionRepository {
    public async saveRegion (): Promise<void> {}
    public async listRegions (): Promise<RegionSubscription[]> {
        return [];
    }
}

class NoopAlertDeliveryRepository implements AlertDeliveryRepository {
    public async claimDelivery (): Promise<boolean> { return true; }
    public async removeDeliveries (): Promise<void> {}
}

class NoopPushNotificationRepository implements PushNotificationRepository {
    public async sendPushNotification (): Promise<void> {}
}

// --- Server factory ----------------------------------------------------------

interface ServerHandle {
    baseUrl: string;
    close: () => Promise<void>;
    testable: TestableActiveStormsRepository;
    stateRepo: MemoryStormStateRepository;
}

async function makeServer (
    activeStorm: StormSummary | null,
    seed: StormState | null,
): Promise<ServerHandle> {
    const hiddenStormIds = new Set<string>();
    const sourceStormRepository = new FakeActiveStormsRepository(activeStorm);
    // The wrapped repo is what the detector and the tracking use case read, so
    // hiding a storm here makes both see it as gone (dissipated).
    const testableStormRepository = new TestableActiveStormsRepository(
        sourceStormRepository,
        hiddenStormIds,
        true,
    );
    const stateRepo = new MemoryStormStateRepository(seed ? [seed] : []);
    const detectStormAlerts = new DetectStormAlertsUseCase(
        testableStormRepository,
        stateRepo,
        new NoopStormSubscriptionRepository(),
        new NoopRegionSubscriptionRepository(),
        new NoopAlertDeliveryRepository(),
        new SendPushNotificationUseCase(new NoopPushNotificationRepository()),
    );
    const getTrackedStorms = new GetTrackedStormsUseCase(
        testableStormRepository,
        new FakeHistoricalStormTrackRepository(),
    );

    const useCases = {
        storm: { getTrackedStorms },
        test: { detectStormAlerts },
    } as unknown as ServerUseCases;

    const rateLimiter = new RateLimiter({ enabled: false, windowMs: 60_000, ipMax: 10 });
    const server = new Server(
        { http: { host: "127.0.0.1", port: 0 } },
        rateLimiter,
        useCases,
        () => "connected",
        {
            hiddenStormIds,
            testableStormRepository,
            sourceStormRepository,
            stormStateRepository: stateRepo,
        },
    );

    const listener = await server.listen();
    const address = listener.address();

    if (!address || typeof address === "string") {
        throw new Error("Expected the HTTP server to bind to a TCP port.");
    }

    const baseUrl = "http://127.0.0.1:" + (address as AddressInfo).port;

    return { baseUrl, close: () => server.close(), testable: testableStormRepository, stateRepo };
}

function dissipate (baseUrl: string): Promise<Response> {
    return fetch(baseUrl + "/v1/test/storm-alerts/" + STORM_ID + "/dissipate", { method: "POST" });
}

function track (baseUrl: string): Promise<Response> {
    return fetch(baseUrl + "/v1/storms/tracking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stormIds: [STORM_ID] }),
    });
}

// --- Tests -------------------------------------------------------------------

test("dissipate an active storm returns dissipated and tracking reflects it", async () => {
    const { baseUrl, close } = await makeServer(ACTIVE_STORM, SEED_STATE);

    try {
        const res = await dissipate(baseUrl);

        assert.equal(res.status, 200);
        const body = await res.json() as { ok: boolean; data: { simulatedStatus: string; alerts: number } };

        assert.equal(body.ok, true);
        assert.equal(body.data.simulatedStatus, "dissipated");
        assert.ok(body.data.alerts >= 1, "expected a storm_dissipated alert");

        const tracked = await track(baseUrl);
        const trackedBody = await tracked.json() as { ok: boolean; data: Array<{ status: string }> };

        assert.equal(tracked.status, 200);
        assert.equal(trackedBody.data[0].status, "dissipated");
    } finally {
        await close();
    }
});

test("dissipate without a prior observed state returns 409 STORM_NOT_READY_FOR_DISSIPATION_TEST", async () => {
    const { baseUrl, close } = await makeServer(ACTIVE_STORM, null);

    try {
        const res = await dissipate(baseUrl);

        assert.equal(res.status, 409);
        const body = await res.json() as { ok: boolean; code: string };

        assert.equal(body.ok, false);
        assert.equal(body.code, "STORM_NOT_READY_FOR_DISSIPATION_TEST");
    } finally {
        await close();
    }
});

test("dissipate twice returns 409 STORM_ALREADY_DISSIPATED on the second call", async () => {
    const { baseUrl, close } = await makeServer(ACTIVE_STORM, SEED_STATE);

    try {
        const first = await dissipate(baseUrl);

        assert.equal(first.status, 200);

        const second = await dissipate(baseUrl);
        const body = await second.json() as { ok: boolean; code: string };

        assert.equal(second.status, 409);
        assert.equal(body.ok, false);
        assert.equal(body.code, "STORM_ALREADY_DISSIPATED");
    } finally {
        await close();
    }
});

test("dissipate a storm not present in the active source returns 404 STORM_NOT_FOUND", async () => {
    const { baseUrl, close } = await makeServer(null, null);

    try {
        const res = await dissipate(baseUrl);

        assert.equal(res.status, 404);
        const body = await res.json() as { ok: boolean; code: string };

        assert.equal(body.ok, false);
        assert.equal(body.code, "STORM_NOT_FOUND");
    } finally {
        await close();
    }
});
