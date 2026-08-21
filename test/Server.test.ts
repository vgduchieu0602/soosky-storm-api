import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import test, { after, before } from "node:test";
import StormSummary from "../src/domain/entities/storm/StormSummary.js";
import StormCone from "../src/domain/entities/storm/StormCone.js";
import StormTrack from "../src/domain/entities/storm/StormTrack.js";
import StormSpaghetti from "../src/domain/entities/storm/StormSpaghetti.js";
import CurrentWeather from "../src/domain/entities/weather/CurrentWeather.js";
import PushNotification from "../src/domain/entities/notification/PushNotification.js";
import ForecastWeather from "../src/domain/entities/weather/ForecastWeather.js";
import HistoricalStormTrack from "../src/domain/entities/storm/HistoricalStormTrack.js";
import MapTile, { MapTileQuery } from "../src/domain/entities/map/MapTile.js";
import Radar from "../src/domain/entities/radar/Radar.js";
import StormNotFoundError from "../src/domain/errors/StormNotFoundError.js";
import StormProviderError from "../src/domain/errors/StormProviderError.js";
import PushNotificationError from "../src/domain/errors/PushNotificationError.js";
import HistoricalStormTrackRepository from "../src/domain/repositories/storm/IHistoricalStormTrackRepository.js";
import SpaghettiRepository from "../src/domain/repositories/storm/ISpaghettiRepository.js";
import StormRepository from "../src/domain/repositories/storm/IStormRepository.js";
import CurrentWeatherRepository, { CurrentWeatherQuery } from "../src/domain/repositories/weather/ICurrentWeatherRepository.js";
import PushNotificationRepository from "../src/domain/repositories/notification/IPushNotificationRepository.js";
import DeviceRepository from "../src/domain/repositories/device/IDeviceRepository.js";
import StormSubscriptionRepository from "../src/domain/repositories/subscription/IStormSubscriptionRepository.js";
import RegionSubscriptionRepository from "../src/domain/repositories/subscription/IRegionSubscriptionRepository.js";
import Device from "../src/domain/entities/device/Device.js";
import StormSubscription from "../src/domain/entities/subscription/StormSubscription.js";
import RegionSubscription from "../src/domain/entities/subscription/RegionSubscription.js";
import StorageUnavailableError from "../src/domain/errors/StorageUnavailableError.js";
import ForecastWeatherRepository, { ForecastWeatherQuery } from "../src/domain/repositories/weather/IForecastWeatherRepository.js";
import MapTileRepository from "../src/domain/repositories/map/IMapTileRepository.js";
import RadarRepository from "../src/domain/repositories/radar/IRadarRepository.js";
import GetActiveStormsUseCase from "../src/domain/use-cases/storm/GetActiveStormsUseCase.js";
import GetDemoStormsUseCase from "../src/domain/use-cases/storm/GetDemoStormsUseCase.js";
import GetTrackedStormsUseCase from "../src/domain/use-cases/storm/GetTrackedStormsUseCase.js";
import GetHistoricalStormTrackUseCase from "../src/domain/use-cases/storm/GetHistoricalStormTrackUseCase.js";
import GetStormConeUseCase from "../src/domain/use-cases/storm/GetStormConeUseCase.js";
import GetStormSpaghettiUseCase from "../src/domain/use-cases/storm/GetStormSpaghettiUseCase.js";
import GetStormTrackUseCase from "../src/domain/use-cases/storm/GetStormTrackUseCase.js";
import GetCurrentWeatherUseCase from "../src/domain/use-cases/weather/GetCurrentWeatherUseCase.js";
import SendPushNotificationUseCase from "../src/domain/use-cases/notification/SendPushNotificationUseCase.js";
import RegisterDeviceUseCase from "../src/domain/use-cases/device/RegisterDeviceUseCase.js";
import SubscribeToStormUseCase from "../src/domain/use-cases/subscription/SubscribeToStormUseCase.js";
import UnsubscribeFromStormUseCase from "../src/domain/use-cases/subscription/UnsubscribeFromStormUseCase.js";
import SaveRegionSubscriptionUseCase from "../src/domain/use-cases/subscription/SaveRegionSubscriptionUseCase.js";
import GetForecastWeatherUseCase from "../src/domain/use-cases/weather/GetForecastWeatherUseCase.js";
import GetMapTileUseCase from "../src/domain/use-cases/map/GetMapTileUseCase.js";
import GetRadarUseCase from "../src/domain/use-cases/radar/GetRadarUseCase.js";
import { markCacheStatus } from "../src/domain/services/cacheStatus.js";
import RateLimiter from "../src/http/RateLimiter.js";
import Server from "../src/http/Server.js";

let server: Server;
let rateLimiter: RateLimiter;
let stormRepository: TestStormRepository;
let spaghettiRepository: TestSpaghettiRepository;
let forecastWeatherRepository: TestForecastWeatherRepository;
let mapTileRepository: TestMapTileRepository;
let radarRepository: TestRadarRepository;
let historicalStormTrackRepository: TestHistoricalStormTrackRepository;
let currentWeatherRepository: TestCurrentWeatherRepository;
let pushNotificationRepository: TestPushNotificationRepository;
let deviceRepository: MemoryDeviceRepository;
let stormSubscriptionRepository: MemoryStormSubscriptionRepository;
let regionSubscriptionRepository: MemoryRegionSubscriptionRepository;
let databaseStatus: string;
let baseUrl: string;

class TestStormRepository implements StormRepository {
    public trackError: Error | null = null;
    public coneError: Error | null = null;
    public gdacsUnavailable = false;

    public readonly summary: StormSummary = {
        stormId: "nhc:EP072026",
        name: "Genevieve",
        source: "nhc",
        basin: "eastern_north_pacific",
        lat: 22.3,
        lon: -130.2,
        datetime: "2026-07-31T21:00:00.000Z",
        windSpeed: 50,
        category: null,
    };

    public readonly track: StormTrack = {
        stormId: "nhc:EP072026",
        name: "Genevieve",
        source: "nhc",
        issuedAt: "2026-07-31T21:00:00.000Z",
        cachedUntil: "2026-07-31T23:00:00.000Z",
        observed: [{
            lat: 22.3,
            lon: -130.2,
            datetime: "2026-07-31T21:00:00.000Z",
            windSpeed: 90,
            category: "category_2",
        }],
        forecast: [],
    };

    public readonly cone: StormCone = {
        stormId: "nhc:EP072026",
        source: "nhc",
        issuedAt: "2026-07-31T21:00:00.000Z",
        cachedUntil: "2026-07-31T23:00:00.000Z",
        availability: "available",
        geometryKind: "forecast_cone",
        geojson: {
            type: "Feature",
            properties: {
                source: "nhc",
                issuedAt: "2026-07-31T21:00:00.000Z",
            },
            geometry: {
                type: "Polygon",
                coordinates: [[[-132.3, 22.8], [-135.2, 23.6], [-136, 23], [-132.3, 22.8]]],
            },
        },
    };

    public readonly gdacsCone: StormCone = {
        stormId: "gdacs:TC:1001298:2",
        source: "gdacs",
        issuedAt: null,
        cachedUntil: "2026-07-31T23:00:00.000Z",
        availability: "available",
        geometryKind: "gdacs_event_area",
        geojson: {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {
                        Class: "Poly_Cones",
                    },
                    geometry: {
                        type: "Polygon",
                        coordinates: [[[-132.3, 22.8], [-135.2, 23.6], [-132.3, 22.8]]],
                    },
                },
            ],
        },
    };

    public readonly gdacsSummary: StormSummary = {
        stormId: "gdacs:TC:1001297:51",
        name: "DOLPHIN-26",
        source: "gdacs",
        basin: null,
        area: "Marshall Islands, Japan, China",
        lat: 27,
        lon: 124.8,
        datetime: "2026-08-08T12:00:00.000Z",
        windSpeed: 145,
        category: "category_5",
    };

    public readonly gdacsTrack: StormTrack = {
        stormId: "gdacs:TC:1001297:51",
        name: "DOLPHIN-26",
        source: "gdacs",
        area: "Marshall Islands, Japan, China",
        issuedAt: "2026-08-08T16:50:16.000Z",
        cachedUntil: null,
        observed: [{
            lat: 27,
            lon: 124.8,
            datetime: "2026-08-08T12:00:00.000Z",
            windSpeed: null,
            category: null,
        }],
        forecast: [{
            lat: 27.3,
            lon: 123.5,
            datetime: "2026-08-09T00:00:00.000Z",
            windSpeed: null,
            category: null,
            forecastHour: 12,
        }],
    };

    public async getActiveStorms (): Promise<StormSummary[]> {
        return [this.summary, this.gdacsSummary];
    }

    public async getStormTrack (stormId: string): Promise<StormTrack> {
        if (this.trackError) {
            throw this.trackError;
        }

        if (stormId === "gdacs:TC:1001297:51") {
            return this.gdacsTrack;
        }

        return this.track;
    }

    public async getStormCone (stormId: string): Promise<StormCone> {
        if (this.coneError) {
            throw this.coneError;
        }

        if (stormId === "gdacs:TC:1001298:2") {
            if (this.gdacsUnavailable) {
                return {
                    stormId,
                    source: "gdacs",
                    issuedAt: null,
                    cachedUntil: null,
                    availability: "not_available",
                    geometryKind: null,
                    reason: "GDACS has not published geometry for this storm event.",
                    geojson: null,
                };
            }

            return this.gdacsCone;
        }

        if (stormId === "nhc:WP012026") {
            return {
                stormId,
                source: "nhc",
                issuedAt: null,
                cachedUntil: null,
                availability: "not_supported",
                geometryKind: null,
                reason: "NHC forecast cones are supported only for AL, EP, and CP basins.",
                geojson: null,
            };
        }

        return this.cone;
    }
}

class TestSpaghettiRepository implements SpaghettiRepository {
    public error: Error | null = null;

    public readonly spaghetti: StormSpaghetti = {
        stormId: "nhc:EP072026",
        source: "nhc-atcf",
        cycleTime: "2026-07-31T18:00:00.000Z",
        cachedUntil: "2026-07-31T20:00:00.000Z",
        availability: "available",
        models: [
            {
                code: "AVNO",
                label: "GFS",
                points: [
                    {
                        forecastHour: 12,
                        lat: 22.8,
                        lon: -132.3,
                        windSpeed: 45,
                    },
                ],
            },
        ],
    };

    public async getStormSpaghetti (stormId: string): Promise<StormSpaghetti> {
        if (this.error) {
            throw this.error;
        }

        if (stormId === "nhc:WP012026") {
            return {
                stormId,
                source: "nhc-atcf",
                cycleTime: null,
                cachedUntil: null,
                availability: "not_supported",
                reason: "NHC ATCF spaghetti data is supported only for AL, EP, and CP basins.",
                models: [],
            };
        }

        return this.spaghetti;
    }
}

class TestForecastWeatherRepository implements ForecastWeatherRepository {
    public error: Error | null = null;

    public readonly forecast: ForecastWeather = {
        location: { lat: 10.8231, lon: 106.6297, timezone: "Asia/Ho_Chi_Minh" },
        units: { temperature: "C", windSpeed: "m/s", visibility: "m", rain: "mm/h" },
        cachedUntil: "2026-08-06T00:00:00.000Z",
        hourly: [{
            time: "2026-08-06T01:00:00.000Z",
            temp: 29.4,
            humidity: 76,
            uvi: null,
            visibility: 10_000,
            windSpeed: 3.2,
            windDeg: 180,
            windDirection: "S",
            pop: 0.35,
            rain1hMm: null,
            weather: [{
                id: 800,
                main: "Clear",
                description: "clear sky",
                icon: "01n",
            }],
        }],
        daily: [],
    };

    public async getForecast (query: ForecastWeatherQuery): Promise<ForecastWeather> {
        if (this.error) {
            throw this.error;
        }

        return {
            ...this.forecast,
            location: { ...this.forecast.location, lat: query.lat, lon: query.lon },
            units: query.units === "imperial"
                ? { ...this.forecast.units, temperature: "F", windSpeed: "mph" }
                : this.forecast.units,
        };
    }
}

class MemoryDeviceRepository implements DeviceRepository {
    public error: Error | null = null;
    public readonly tokens = new Set<string>();

    public async registerDevice (device: Device): Promise<boolean> {
        if (this.error) {
            throw this.error;
        }

        if (this.tokens.has(device.deviceToken)) {
            return false;
        }

        this.tokens.add(device.deviceToken);

        return true;
    }
}

class MemoryStormSubscriptionRepository implements StormSubscriptionRepository {
    public error: Error | null = null;
    public readonly pairs = new Set<string>();

    public async subscribe (subscription: StormSubscription): Promise<boolean> {
        if (this.error) {
            throw this.error;
        }

        const key = toKey(subscription);

        if (this.pairs.has(key)) {
            return false;
        }

        this.pairs.add(key);

        return true;
    }

    public async unsubscribe (subscription: StormSubscription): Promise<boolean> {
        if (this.error) {
            throw this.error;
        }

        return this.pairs.delete(toKey(subscription));
    }
}

class MemoryRegionSubscriptionRepository implements RegionSubscriptionRepository {
    public error: Error | null = null;
    public readonly regions = new Map<string, RegionSubscription>();

    public async saveRegion (subscription: RegionSubscription): Promise<void> {
        if (this.error) {
            throw this.error;
        }

        this.regions.set(subscription.deviceToken, subscription);
    }
}

function toKey (subscription: StormSubscription): string {
    return subscription.deviceToken + "|" + subscription.stormId;
}

class TestPushNotificationRepository implements PushNotificationRepository {
    public error: Error | null = null;
    public readonly sent: PushNotification[] = [];

    public async sendPushNotification (notification: PushNotification): Promise<void> {
        if (this.error) {
            throw this.error;
        }

        this.sent.push(notification);
    }
}

class TestCurrentWeatherRepository implements CurrentWeatherRepository {
    public error: Error | null = null;

    public readonly observation: CurrentWeather = {
        location: { lat: 10.8231, lon: 106.6297, timezone: "Asia/Ho_Chi_Minh" },
        units: { temperature: "C", windSpeed: "m/s", visibility: "m", rain: "mm/h" },
        observedAt: "2026-08-08T17:21:51.000Z",
        cachedUntil: "2026-08-08T17:31:51.000Z",
        temperature: 28.97,
        humidity: 85,
        uvi: 0,
        visibility: 10_000,
        windSpeed: 4.49,
        windDeg: 239,
        windDirection: "WSW",
        rain1h: null,
        precipitationProbability: 0.35,
        weatherDescription: "overcast clouds",
        weather: [{ id: 804, main: "Clouds", description: "overcast clouds", icon: "04n" }],
    };

    public async getCurrentWeather (query: CurrentWeatherQuery): Promise<CurrentWeather> {
        if (this.error) {
            throw this.error;
        }

        return {
            ...this.observation,
            location: { ...this.observation.location, lat: query.lat, lon: query.lon },
            units: query.units === "imperial"
                ? { ...this.observation.units, temperature: "F", windSpeed: "mph" }
                : this.observation.units,
        };
    }
}

class TestMapTileRepository implements MapTileRepository {
    public error: Error | null = null;
    public readonly queries: MapTileQuery[] = [];

    public async getTile (query: MapTileQuery): Promise<MapTile> {
        if (this.error) {
            throw this.error;
        }

        this.queries.push(query);

        return { buffer: Buffer.from("png"), contentType: "image/png" };
    }
}

class TestRadarRepository implements RadarRepository {
    public error: Error | null = null;

    public readonly radar: Radar = {
        source: "rainviewer",
        attribution: "Weather data by RainViewer",
        attributionUrl: "https://www.rainviewer.com/",
        host: "https://tilecache.rainviewer.com",
        tileTemplate: "https://tilecache.rainviewer.com{path}/256/{z}/{x}/{y}/2/1_1.png",
        past: [],
        nowcast: [],
        generatedAt: "2026-08-05T00:00:00.000Z",
        cachedUntil: "2026-08-05T12:00:00.000Z",
    };

    public async getRadar (): Promise<Radar> {
        if (this.error) {
            throw this.error;
        }

        return this.radar;
    }
}

class TestHistoricalStormTrackRepository implements HistoricalStormTrackRepository {
    public error: Error | null = null;

    public readonly historyTrack: HistoricalStormTrack = {
        stormId: "nhc:EP072025",
        name: "EP072025",
        source: "nhc",
        trackKind: "best_track",
        cachedUntil: "2026-08-06T02:00:00.000Z",
        availability: "available",
        history: [{
            lat: 15,
            lon: -120,
            datetime: "2025-08-03T00:00:00.000Z",
            windSpeed: 65,
            category: "category_1",
        }],
    };

    public async getHistoricalStormTrack (stormId: string): Promise<HistoricalStormTrack> {
        if (this.error) {
            throw this.error;
        }

        return { ...this.historyTrack, stormId };
    }
}

before(async () => {
    databaseStatus = "connected";
    rateLimiter = new RateLimiter({
        enabled: false,
        windowMs: 60_000,
        ipMax: 10,
    });
    stormRepository = new TestStormRepository();
    spaghettiRepository = new TestSpaghettiRepository();
    forecastWeatherRepository = new TestForecastWeatherRepository();
    mapTileRepository = new TestMapTileRepository();
    radarRepository = new TestRadarRepository();
    historicalStormTrackRepository = new TestHistoricalStormTrackRepository();
    currentWeatherRepository = new TestCurrentWeatherRepository();
    pushNotificationRepository = new TestPushNotificationRepository();
    deviceRepository = new MemoryDeviceRepository();
    stormSubscriptionRepository = new MemoryStormSubscriptionRepository();
    regionSubscriptionRepository = new MemoryRegionSubscriptionRepository();
    server = new Server({
        http: {
            host: "127.0.0.1",
            port: 0,
        },
    }, rateLimiter, createUseCases(
        stormRepository,
        spaghettiRepository,
        forecastWeatherRepository,
        mapTileRepository,
        radarRepository,
        historicalStormTrackRepository,
        currentWeatherRepository,
        pushNotificationRepository,
        deviceRepository,
        stormSubscriptionRepository,
        regionSubscriptionRepository,
    ), () => databaseStatus);

    const listener = await server.listen();
    const address = listener.address();

    if (!address || typeof address === "string") {
        throw new Error("Expected the HTTP server to bind to a TCP port.");
    }

    baseUrl = "http://127.0.0.1:" + (address as AddressInfo).port;
});

after(async () => {
    rateLimiter.dispose();

    if (server) {
        await server.close();
    }
});

test("GET /health returns the service health envelope", async () => {
    const response = await fetch(baseUrl + "/health");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: {
            service: "soosky-storm-api",
            database: "connected",
        },
        cacheStatus: "bypass",
    });
});

test("GET /health reports the live database status instead of a fixed value", async () => {
    databaseStatus = "disconnected";

    try {
        const response = await fetch(baseUrl + "/health");

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
            ok: true,
            data: {
                service: "soosky-storm-api",
                database: "disconnected",
            },
            cacheStatus: "bypass",
        });
    } finally {
        databaseStatus = "connected";
    }
});

test("unknown routes return the standard not-found envelope", async () => {
    const response = await fetch(baseUrl + "/does-not-exist");

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
        ok: false,
        code: "NOT_FOUND",
        reason: "Route not found",
    });
});

test("GET /v1/storms returns active NHC storms", async () => {
    const response = await fetch(baseUrl + "/v1/storms?region=us-nhc");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: [{
            ...stormRepository.summary,
            area: "PO",
            message: null,
        }],
        cacheStatus: "bypass",
    });
});

test("GET /v1/storms/demo returns one to five random demo storms", async () => {
    const response = await fetch(baseUrl + "/v1/storms/demo");

    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.ok, true);
    assert.equal(payload.data.length >= 1 && payload.data.length <= 5, true);
    assert.equal(payload.data.every((storm: { isDemo: boolean }) => storm.isDemo), true);
});

test("GET /v1/storms returns every provider's storms when no region is given", async () => {
    const response = await fetch(baseUrl + "/v1/storms");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: [{
            ...stormRepository.summary,
            area: "PO",
            message: null,
        }, {
            ...stormRepository.gdacsSummary,
            area: "PO",
            message: "Extreme danger. Leave immediately if ordered.",
        }],
        cacheStatus: "bypass",
    });
});

test("GET /v1/storms includes each active storm's area and safety message", async () => {
    const response = await fetch(baseUrl + "/v1/storms");
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.data.map((storm: { stormId: string; area: string | null; message: string | null }) => ({
        stormId: storm.stormId,
        area: storm.area,
        message: storm.message,
    })), [
        {
            stormId: "nhc:EP072026",
            area: "PO",
            message: null,
        },
        {
            stormId: "gdacs:TC:1001297:51",
            area: "PO",
            message: "Extreme danger. Leave immediately if ordered.",
        },
    ]);
});

test("POST /v1/storms/tracking resolves active and dissipated storm cards in one request", async () => {
    const response = await fetch(baseUrl + "/v1/storms/tracking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            stormIds: ["gdacs:TC:1001297:50", "nhc:EP072025"],
        }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: [{
            requestedStormId: "gdacs:TC:1001297:50",
            trackingId: "gdacs:TC:1001297",
            stormId: "gdacs:TC:1001297:51",
            name: "DOLPHIN-26",
            source: "gdacs",
            area: "PO",
            status: "active",
            category: "category_5",
            message: "Extreme danger. Leave immediately if ordered.",
            lat: 27,
            lon: 124.8,
            updatedAt: "2026-08-08T12:00:00.000Z",
            endedAt: null,
        }, {
            requestedStormId: "nhc:EP072025",
            trackingId: "nhc:EP072025",
            stormId: "nhc:EP072025",
            name: "EP072025",
            source: "nhc",
            area: "PO",
            status: "dissipated",
            category: "category_1",
            message: "Secure loose items, check emergency supplies now",
            lat: 15,
            lon: -120,
            updatedAt: "2025-08-03T00:00:00.000Z",
            endedAt: "2025-08-03T00:00:00.000Z",
        }],
        cacheStatus: "bypass",
    });
});

test("POST /v1/storms/tracking rejects an empty or malformed storm ID list", async () => {
    for (const stormIds of [[], ["not-a-storm"]]) {
        const response = await fetch(baseUrl + "/v1/storms/tracking", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ stormIds }),
        });

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
            ok: false,
            code: "BAD_REQUEST",
            reason: "Field 'stormIds' must be an array containing 1 to 20 valid storm IDs.",
        });
    }
});

test("GET /v1/storms returns only GDACS storms for region=gdacs", async () => {
    const response = await fetch(baseUrl + "/v1/storms?region=gdacs");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: [{
            ...stormRepository.gdacsSummary,
            area: "PO",
            message: "Extreme danger. Leave immediately if ordered.",
        }],
        cacheStatus: "bypass",
    });
});

test("GET /v1/storms accepts region=all", async () => {
    const response = await fetch(baseUrl + "/v1/storms?region=all");

    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.length, 2);
});

test("GET /v1/storms rejects an unsupported region", async () => {
    const response = await fetch(baseUrl + "/v1/storms?region=western-north-pacific");

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        ok: false,
        code: "BAD_REQUEST",
        reason: "Query param 'region' must be 'us-nhc', 'gdacs', or 'all'.",
    });
});

test("GET /v1/weather/forecast returns metric weather by default", async () => {
    const response = await fetch(baseUrl + "/v1/weather/forecast?lat=10.8231&lon=106.6297");

    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.ok, true);
    assert.deepEqual(body.data.hourly[0].weather, [{
        id: 800,
        main: "Clear",
        description: "clear sky",
        icon: "01n",
    }]);
    assert.deepEqual(body.data.daily, forecastWeatherRepository.forecast.daily);
});

test("GET /v1/weather/forecast accepts imperial units", async () => {
    const response = await fetch(baseUrl + "/v1/weather/forecast?lat=10.8231&lon=106.6297&units=imperial");

    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.units.temperature, "F");
});

test("GET /v1/weather/forecast rejects invalid coordinates and units", async () => {
    const invalidLat = await fetch(baseUrl + "/v1/weather/forecast?lat=91&lon=106");
    const invalidUnits = await fetch(baseUrl + "/v1/weather/forecast?lat=10&lon=106&units=kelvin");

    assert.equal(invalidLat.status, 400);
    assert.equal(invalidUnits.status, 400);
});

test("weather endpoints explain when latitude and longitude are blank", async () => {
    for (const path of ["/v1/weather/current?lat=&lon=", "/v1/weather/forecast?lat=&lon="]) {
        const response = await fetch(baseUrl + path);

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
            ok: false,
            code: "BAD_REQUEST",
            reason: "Query params 'lat' and 'lon' are required.",
        });
    }
});

test("weather endpoints explain when latitude and longitude are invalid", async () => {
    for (const path of ["/v1/weather/current?lat=dfvgd&lon=bbff", "/v1/weather/forecast?lat=dfvgd&lon=bbff"]) {
        const response = await fetch(baseUrl + path);

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
            ok: false,
            code: "BAD_REQUEST",
            reason: "Query params 'lat' and 'lon' must be valid decimal coordinates.",
        });
    }
});

test("GET /v1/weather/forecast maps an upstream error to 502", async () => {
    forecastWeatherRepository.error = new StormProviderError("OpenWeather timed out.");

    try {
        const response = await fetch(baseUrl + "/v1/weather/forecast?lat=10&lon=106");

        assert.equal(response.status, 502);
        assert.equal((await response.json()).cacheStatus, "upstream");
    } finally {
        forecastWeatherRepository.error = null;
    }
});

test("GET /v1/map-tiles returns a binary OpenWeather tile", async () => {
    const response = await fetch(baseUrl + "/v1/map-tiles/temperature/3/6/3");

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), "png");
});

test("GET /v1/map-tiles rejects invalid layer and tile coordinates", async () => {
    const invalidLayer = await fetch(baseUrl + "/v1/map-tiles/clouds/3/6/3");
    const invalidCoordinate = await fetch(baseUrl + "/v1/map-tiles/windSpeed/3/8/3");

    assert.equal(invalidLayer.status, 400);
    assert.equal(invalidCoordinate.status, 400);
});

test("GET /v1/map-tiles maps an upstream error to 502", async () => {
    mapTileRepository.error = new StormProviderError("OpenWeather tile failed.");

    try {
        const response = await fetch(baseUrl + "/v1/map-tiles/windSpeed/3/6/3");
        assert.equal(response.status, 502);
    } finally {
        mapTileRepository.error = null;
    }
});

test("GET /v1/radar returns the RainViewer manifest envelope", async () => {
    const response = await fetch(baseUrl + "/v1/radar");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: radarRepository.radar,
        cacheStatus: "bypass",
    });
});

test("GET /v1/radar maps an upstream error to 502", async () => {
    radarRepository.error = new StormProviderError("RainViewer failed.");

    try {
        const response = await fetch(baseUrl + "/v1/radar");
        assert.equal(response.status, 502);
    } finally {
        radarRepository.error = null;
    }
});

test("GET /v1/storms/:stormId/track returns the normalized track", async () => {
    const response = await fetch(baseUrl + "/v1/storms/nhc:EP072026/track");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: {
            stormId: "nhc:EP072026",
            name: "Genevieve",
            source: "nhc",
            area: "PO",
            issuedAt: "2026-07-31T21:00:00.000Z",
            cachedUntil: "2026-07-31T23:00:00.000Z",
            category: "category_2",
            message: "Review evacuation route. Power outages likely",
            observed: [{
                lat: 22.3,
                lon: -130.2,
                datetime: "2026-07-31T21:00:00.000Z",
                windSpeed: 90,
                category: "category_2",
                message: "Review evacuation route. Power outages likely",
            }],
            forecast: [],
        },
        cacheStatus: "bypass",
    });
});

test("GET /v1/storms/:stormId/track exposes whether the result came from cache", async () => {
    markCacheStatus(stormRepository.track, "cached");

    try {
        const response = await fetch(baseUrl + "/v1/storms/nhc:EP072026/track");

        assert.equal(response.status, 200);
        assert.equal(response.headers.get("x-cache-status"), null);
        assert.equal((await response.json()).cacheStatus, "cached");
    } finally {
        markCacheStatus(stormRepository.track, "upstream");
    }
});

test("GET /v1/storms/:stormId/track accepts a GDACS storm ID", async () => {
    const response = await fetch(baseUrl + "/v1/storms/gdacs:TC:1001297:51/track");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: {
            stormId: "gdacs:TC:1001297:51",
            name: "DOLPHIN-26",
            source: "gdacs",
            area: "PO",
            issuedAt: "2026-08-08T16:50:16.000Z",
            cachedUntil: null,
            category: null,
            message: null,
            observed: [{
                lat: 27,
                lon: 124.8,
                datetime: "2026-08-08T12:00:00.000Z",
                windSpeed: null,
                category: null,
                message: null,
            }],
            forecast: [{
                lat: 27.3,
                lon: 123.5,
                datetime: "2026-08-09T00:00:00.000Z",
                windSpeed: null,
                category: null,
                message: null,
                forecastHour: 12,
            }],
        },
        cacheStatus: "bypass",
    });
});

test("GET /v1/storms/:stormId/track maps every hurricane category to its safety message", async () => {
    const original = stormRepository.track.observed[0]!;
    const examples = [
        ["category_1", "category_1", "Secure loose items, check emergency supplies now"],
        ["category_2", "category_2", "Review evacuation route. Power outages likely"],
        ["category_3", "category_3", "Major hurricane. Follow evacuation orders if issued"],
        ["category_4", "category_4", "Catastrophic winds. Evacuate now if advised."],
        ["category_5", "category_5", "Extreme danger. Leave immediately if ordered."],
    ] as const;

    try {
        for (const [category, expectedCategory, expectedMessage] of examples) {
            stormRepository.track.observed[0] = { ...original, category };

            const response = await fetch(baseUrl + "/v1/storms/nhc:EP072026/track");
            const payload = await response.json();

            assert.equal(payload.data.category, expectedCategory);
            assert.equal(payload.data.message, expectedMessage);
        }
    } finally {
        stormRepository.track.observed[0] = original;
    }
});

test("GET /v1/storms/:stormId/track rejects a malformed GDACS storm ID", async () => {
    const response = await fetch(baseUrl + "/v1/storms/gdacs:TC:abc:51/track");

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        ok: false,
        code: "BAD_REQUEST",
        reason: "Path param 'stormId' is invalid.",
    });
});

test("GET /v1/storms/:stormId/track rejects a malformed storm ID", async () => {
    const response = await fetch(baseUrl + "/v1/storms/not-a-storm/track");

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        ok: false,
        code: "BAD_REQUEST",
        reason: "Path param 'stormId' is invalid.",
    });
});

test("GET /v1/storms/:stormId/track maps a missing storm to 404", async () => {
    stormRepository.trackError = new StormNotFoundError("nhc:EP072026");

    try {
        const response = await fetch(baseUrl + "/v1/storms/nhc:EP072026/track");

        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), {
            ok: false,
            code: "STORM_NOT_FOUND",
            reason: "Storm [nhc:EP072026] was not found.",
        });
    } finally {
        stormRepository.trackError = null;
    }
});

test("GET /v1/storms/:stormId/track maps a provider failure to 502", async () => {
    stormRepository.trackError = new StormProviderError("NHC timed out.");

    try {
        const response = await fetch(baseUrl + "/v1/storms/nhc:EP072026/track");

        assert.equal(response.status, 502);
        assert.deepEqual(await response.json(), {
            ok: false,
            code: "UPSTREAM_UNAVAILABLE",
            reason: "Storm data is temporarily unavailable",
            cacheStatus: "upstream",
        });
    } finally {
        stormRepository.trackError = null;
    }
});

test("GET /v1/storms/:stormId/spaghetti returns model forecast lines", async () => {
    const response = await fetch(baseUrl + "/v1/storms/nhc:EP072026/spaghetti");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: spaghettiRepository.spaghetti,
        cacheStatus: "bypass",
    });
});

test("GET /v1/storms/:stormId/spaghetti rejects a malformed storm ID", async () => {
    const response = await fetch(baseUrl + "/v1/storms/not-a-storm/spaghetti");

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        ok: false,
        code: "BAD_REQUEST",
        reason: "Path param 'stormId' is invalid.",
    });
});

test("GET /v1/storms/:stormId/spaghetti returns unsupported NHC basins as success", async () => {
    const response = await fetch(baseUrl + "/v1/storms/nhc:WP012026/spaghetti");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: {
            stormId: "nhc:WP012026",
            source: "nhc-atcf",
            cycleTime: null,
            cachedUntil: null,
            availability: "not_supported",
            reason: "NHC ATCF spaghetti data is supported only for AL, EP, and CP basins.",
            models: [],
        },
        cacheStatus: "bypass",
    });
});

test("GET /v1/storms/:stormId/spaghetti maps a provider failure to 502", async () => {
    spaghettiRepository.error = new StormProviderError("NHC ATCF timed out.");

    try {
        const response = await fetch(baseUrl + "/v1/storms/nhc:EP072026/spaghetti");

        assert.equal(response.status, 502);
        assert.deepEqual(await response.json(), {
            ok: false,
            code: "UPSTREAM_UNAVAILABLE",
            reason: "Storm data is temporarily unavailable",
            cacheStatus: "upstream",
        });
    } finally {
        spaghettiRepository.error = null;
    }
});

test("GET /v1/storms/:stormId/cone returns an NHC GeoJSON cone", async () => {
    const response = await fetch(baseUrl + "/v1/storms/nhc:EP072026/cone");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: stormRepository.cone,
        cacheStatus: "bypass",
    });
});

test("GET /v1/storms/:stormId/cone returns unsupported basins as success", async () => {
    const response = await fetch(baseUrl + "/v1/storms/nhc:WP012026/cone");

    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.availability, "not_supported");
});

test("GET /v1/storms/:stormId/cone maps a provider failure to 502", async () => {
    stormRepository.coneError = new StormProviderError("NHC cone failed.");

    try {
        const response = await fetch(baseUrl + "/v1/storms/nhc:EP072026/cone");

        assert.equal(response.status, 502);
    } finally {
        stormRepository.coneError = null;
    }
});

test("GET /v1/storms/:stormId/cone returns a GDACS event area", async () => {
    const response = await fetch(baseUrl + "/v1/storms/gdacs:TC:1001298:2/cone");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: stormRepository.gdacsCone,
        cacheStatus: "bypass",
    });
});

test("GET /v1/storms/:stormId/cone rejects a malformed GDACS ID", async () => {
    const response = await fetch(baseUrl + "/v1/storms/gdacs:TC:abc:2/cone");

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        ok: false,
        code: "BAD_REQUEST",
        reason: "Path param 'stormId' is invalid.",
    });
});

test("GET /v1/storms/:stormId/cone returns unavailable GDACS geometry as success", async () => {
    stormRepository.gdacsUnavailable = true;

    try {
        const response = await fetch(baseUrl + "/v1/storms/gdacs:TC:1001298:2/cone");

        assert.equal(response.status, 200);
        assert.equal((await response.json()).data.availability, "not_available");
    } finally {
        stormRepository.gdacsUnavailable = false;
    }
});

test("GET /v1/storms/:stormId/cone maps a GDACS provider failure to 502", async () => {
    stormRepository.coneError = new StormProviderError("GDACS geometry failed.");

    try {
        const response = await fetch(baseUrl + "/v1/storms/gdacs:TC:1001298:2/cone");

        assert.equal(response.status, 502);
    } finally {
        stormRepository.coneError = null;
    }
});

test("GET /v1/storms/:stormId/history-track returns the normalized history", async () => {
    const response = await fetch(baseUrl + "/v1/storms/nhc:EP072025/history-track");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: historicalStormTrackRepository.historyTrack,
        cacheStatus: "bypass",
    });
});

test("GET /v1/weather/current returns the normalized observation", async () => {
    const response = await fetch(baseUrl + "/v1/weather/current?lat=10.8231&lon=106.6297");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: currentWeatherRepository.observation,
        cacheStatus: "bypass",
    });
});

test("GET /v1/weather/current exposes every requested field", async () => {
    const response = await fetch(baseUrl + "/v1/weather/current?lat=10.8231&lon=106.6297");
    const { data } = await response.json();

    for (const field of [
        "temperature",
        "humidity",
        "uvi",
        "visibility",
        "windSpeed",
        "windDeg",
        "rain1h",
        "precipitationProbability",
        "weatherDescription",
    ]) {
        assert.ok(field in data, "expected field " + field);
    }
});

test("GET /v1/weather/current defaults to metric and accepts every supported unit", async (context) => {
    const expectedTemperatures: Record<string, string> = {
        "": "C",
        "&units=metric": "C",
        "&units=standard": "C",
        "&units=imperial": "F",
    };

    for (const [suffix, temperature] of Object.entries(expectedTemperatures)) {
        await context.test("units" + suffix, async () => {
            const response = await fetch(baseUrl + "/v1/weather/current?lat=10&lon=106" + suffix);

            assert.equal(response.status, 200);
            assert.equal((await response.json()).data.units.temperature, temperature);
        });
    }
});

test("GET /v1/weather/current rejects invalid coordinates", async (context) => {
    const invalidQueries = [
        "lat=91&lon=106",
        "lat=-91&lon=106",
        "lat=10&lon=181",
        "lat=10&lon=-181",
        "lat=abc&lon=106",
        "lon=106",
        "lat=10",
        "lat=&lon=106",
    ];

    for (const query of invalidQueries) {
        await context.test(query, async () => {
            const response = await fetch(baseUrl + "/v1/weather/current?" + query);

            assert.equal(response.status, 400);
            assert.equal((await response.json()).code, "BAD_REQUEST");
        });
    }
});

test("GET /v1/weather/current rejects an unsupported unit", async () => {
    const response = await fetch(baseUrl + "/v1/weather/current?lat=10&lon=106&units=kelvin");

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        ok: false,
        code: "BAD_REQUEST",
        reason: "Query param 'units' must be 'standard', 'metric', or 'imperial'.",
    });
});

test("GET /v1/weather/current maps an upstream error to 502", async () => {
    currentWeatherRepository.error = new StormProviderError("OpenWeather timed out.");

    try {
        const response = await fetch(baseUrl + "/v1/weather/current?lat=10&lon=106");

        assert.equal(response.status, 502);
        assert.equal((await response.json()).code, "UPSTREAM_UNAVAILABLE");
    } finally {
        currentWeatherRepository.error = null;
    }
});

test("GET /v1/weather/forecast rejects invalid coordinates beyond both bounds", async (context) => {
    for (const query of ["lat=-91&lon=106", "lat=10&lon=181", "lat=abc&lon=106", "lon=106"]) {
        await context.test(query, async () => {
            const response = await fetch(baseUrl + "/v1/weather/forecast?" + query);

            assert.equal(response.status, 400);
        });
    }
});

test("GET /v1/map-tiles serves the minimum and maximum supported zoom", async (context) => {
    for (const path of ["windSpeed/0/0/0", "temperature/1/1/1", "pressure/12/101/57"]) {
        await context.test(path, async () => {
            const response = await fetch(baseUrl + "/v1/map-tiles/" + path);

            assert.equal(response.status, 200);
            assert.equal(response.headers.get("content-type"), "image/png");
        });
    }
});

test("GET /v1/map-tiles serves every supported layer", async (context) => {
    for (const layer of ["windSpeed", "temperature", "pressure", "precipitation"]) {
        await context.test(layer, async () => {
            const response = await fetch(baseUrl + "/v1/map-tiles/" + layer + "/3/6/3");

            assert.equal(response.status, 200);
            assert.deepEqual(mapTileRepository.queries.at(-1), { layer, z: 3, x: 6, y: 3 });
        });
    }
});

test("GET /v1/map-tiles rejects a zoom outside the supported range", async (context) => {
    for (const path of ["windSpeed/13/1/1", "windSpeed/-1/0/0", "windSpeed/abc/0/0"]) {
        await context.test(path, async () => {
            const response = await fetch(baseUrl + "/v1/map-tiles/" + path);

            assert.equal(response.status, 400);
            assert.deepEqual(await response.json(), {
                ok: false,
                code: "BAD_REQUEST",
                reason: "Path params 'z', 'x', and 'y' are invalid.",
            });
        });
    }
});

test("GET /v1/map-tiles rejects x or y outside the zoom grid", async (context) => {
    for (const path of ["windSpeed/2/4/1", "windSpeed/2/1/4", "windSpeed/7/128/1", "windSpeed/7/1/128"]) {
        await context.test(path, async () => {
            const response = await fetch(baseUrl + "/v1/map-tiles/" + path);

            assert.equal(response.status, 400);
            assert.deepEqual(await response.json(), {
                ok: false,
                code: "BAD_REQUEST",
                reason: "Path params 'x' and 'y' are invalid for this zoom.",
            });
        });
    }
});

test("GET /v1/map-tiles accepts the last valid tile of a zoom level", async () => {
    const response = await fetch(baseUrl + "/v1/map-tiles/windSpeed/2/3/3");

    assert.equal(response.status, 200);
});

test("GET /v1/storms/:stormId/history-track accepts a GDACS storm ID", async () => {
    const response = await fetch(baseUrl + "/v1/storms/gdacs:TC:1001297:51/history-track");

    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.stormId, "gdacs:TC:1001297:51");
});

test("GET /v1/storms/:stormId/history-track rejects a malformed GDACS storm ID", async () => {
    const response = await fetch(baseUrl + "/v1/storms/gdacs:TC:1001297/history-track");

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        ok: false,
        code: "BAD_REQUEST",
        reason: "Path param 'stormId' is invalid.",
    });
});

test("GET /v1/storms/:stormId/history-track rejects an unsupported basin", async () => {
    const response = await fetch(baseUrl + "/v1/storms/nhc:WP012025/history-track");

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        ok: false,
        code: "BAD_REQUEST",
        reason: "Path param 'stormId' is invalid.",
    });
});

test("GET /v1/storms/:stormId/history-track maps a provider failure to 502", async () => {
    historicalStormTrackRepository.error = new StormProviderError("NHC request failed");

    try {
        const response = await fetch(baseUrl + "/v1/storms/nhc:EP072025/history-track");

        assert.equal(response.status, 502);
        assert.equal((await response.json()).code, "UPSTREAM_UNAVAILABLE");
    } finally {
        historicalStormTrackRepository.error = null;
    }
});

test("GET /v1/storms/:stormId/history-track maps a storm that cannot be resolved to 404", async () => {
    historicalStormTrackRepository.error = new StormNotFoundError("nhc:EP072025");

    try {
        const response = await fetch(baseUrl + "/v1/storms/nhc:EP072025/history-track");

        assert.equal(response.status, 404);
        assert.equal((await response.json()).code, "STORM_NOT_FOUND");
    } finally {
        historicalStormTrackRepository.error = null;
    }
});

const VALID_DEVICE_TOKEN = "a".repeat(64);

function sendNotification (body: unknown): Promise<globalThis.Response> {
    return fetch(baseUrl + "/v1/notifications/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

test("POST /v1/notifications/send delivers the notification and returns the standard envelope", async () => {
    const response = await sendNotification({
        deviceToken: VALID_DEVICE_TOKEN,
        title: "Storm Warning",
        description: "Hurricane Erin may affect your area.",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: {
            title: "Storm Warning",
            description: "Hurricane Erin may affect your area.",
            sent: true,
            stormId: null,
            type: null,
        },
        cacheStatus: "bypass",
    });
    assert.deepEqual(pushNotificationRepository.sent.at(-1), {
        deviceToken: VALID_DEVICE_TOKEN,
        title: "Storm Warning",
        description: "Hurricane Erin may affect your area.",
    });
});

test("POST /v1/notifications/send forwards an optional stormId and type and echoes them back", async () => {
    const response = await sendNotification({
        deviceToken: VALID_DEVICE_TOKEN,
        title: "Storm Warning",
        description: "Hurricane Erin may affect your area.",
        stormId: "nhc:EP072026",
        type: "category_change",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: {
            title: "Storm Warning",
            description: "Hurricane Erin may affect your area.",
            sent: true,
            stormId: "nhc:EP072026",
            type: "category_change",
        },
        cacheStatus: "bypass",
    });
    assert.deepEqual(pushNotificationRepository.sent.at(-1), {
        deviceToken: VALID_DEVICE_TOKEN,
        title: "Storm Warning",
        description: "Hurricane Erin may affect your area.",
        stormId: "nhc:EP072026",
        type: "category_change",
    });
});

test("POST /v1/notifications/send rejects an unknown alert type", async (context) => {
    const invalidTypes: unknown[] = ["storm_update", "NEW_STORM", "", 7];

    for (const type of invalidTypes) {
        await context.test(JSON.stringify(type), async () => {
            const before = pushNotificationRepository.sent.length;
            const response = await sendNotification({
                deviceToken: VALID_DEVICE_TOKEN,
                title: "Storm Warning",
                description: "Hurricane Erin may affect your area.",
                type,
            });

            assert.equal(response.status, 400);
            assert.equal((await response.json()).code, "BAD_REQUEST");
            assert.equal(pushNotificationRepository.sent.length, before);
        });
    }
});

test("POST /v1/notifications/send rejects an invalid stormId", async (context) => {
    const invalidStormIds: unknown[] = ["EP072026", "nhc:ep072026", "gdacs:TC:0:51", 42, ""];

    for (const stormId of invalidStormIds) {
        await context.test(JSON.stringify(stormId), async () => {
            const before = pushNotificationRepository.sent.length;
            const response = await sendNotification({
                deviceToken: VALID_DEVICE_TOKEN,
                title: "Storm Warning",
                description: "Hurricane Erin may affect your area.",
                stormId,
            });

            assert.equal(response.status, 400);
            assert.equal((await response.json()).code, "BAD_REQUEST");
            assert.equal(pushNotificationRepository.sent.length, before);
        });
    }
});

test("POST /v1/notifications/send never echoes the device token", async () => {
    const response = await sendNotification({
        deviceToken: VALID_DEVICE_TOKEN,
        title: "Storm Warning",
        description: "Hurricane Erin may affect your area.",
    });

    assert.equal(JSON.stringify(await response.json()).includes(VALID_DEVICE_TOKEN), false);
});

test("POST /v1/notifications/send rejects a missing or blank field", async (context) => {
    const invalidBodies: [string, unknown][] = [
        ["missing deviceToken", { title: "t", description: "d" }],
        ["missing title", { deviceToken: VALID_DEVICE_TOKEN, description: "d" }],
        ["missing description", { deviceToken: VALID_DEVICE_TOKEN, title: "t" }],
        ["blank deviceToken", { deviceToken: "   ", title: "t", description: "d" }],
        ["blank title", { deviceToken: VALID_DEVICE_TOKEN, title: "  ", description: "d" }],
        ["blank description", { deviceToken: VALID_DEVICE_TOKEN, title: "t", description: "" }],
        ["non-string title", { deviceToken: VALID_DEVICE_TOKEN, title: 42, description: "d" }],
        ["empty body", {}],
        ["array body", []],
        ["null body", null],
    ];

    for (const [name, body] of invalidBodies) {
        await context.test(name, async () => {
            const before = pushNotificationRepository.sent.length;
            const response = await sendNotification(body);

            assert.equal(response.status, 400);
            assert.equal((await response.json()).code, "BAD_REQUEST");
            assert.equal(pushNotificationRepository.sent.length, before);
        });
    }
});

test("POST /v1/notifications/send rejects an over-long title or description", async (context) => {
    const oversized: [string, unknown][] = [
        ["title", { deviceToken: VALID_DEVICE_TOKEN, title: "t".repeat(257), description: "d" }],
        ["description", { deviceToken: VALID_DEVICE_TOKEN, title: "t", description: "d".repeat(2049) }],
    ];

    for (const [name, body] of oversized) {
        await context.test(name, async () => {
            const response = await sendNotification(body);

            assert.equal(response.status, 400);
            assert.equal((await response.json()).code, "BAD_REQUEST");
        });
    }
});

test("POST /v1/notifications/send maps an APNs device-token rejection to 400", async () => {
    pushNotificationRepository.error = new PushNotificationError("APNs rejected the device token.", "invalid_device_token");

    try {
        const response = await sendNotification({
            deviceToken: VALID_DEVICE_TOKEN,
            title: "Storm Warning",
            description: "Hurricane Erin may affect your area.",
        });

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
            ok: false,
            code: "INVALID_DEVICE_TOKEN",
            reason: "The device token was rejected",
        });
    } finally {
        pushNotificationRepository.error = null;
    }
});

test("POST /v1/notifications/send maps missing APNs configuration to 503", async () => {
    pushNotificationRepository.error = new PushNotificationError("Push notifications are not configured.", "not_configured");

    try {
        const response = await sendNotification({
            deviceToken: VALID_DEVICE_TOKEN,
            title: "Storm Warning",
            description: "Hurricane Erin may affect your area.",
        });

        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {
            ok: false,
            code: "PUSH_NOT_CONFIGURED",
            reason: "Push notifications are not configured",
        });
    } finally {
        pushNotificationRepository.error = null;
    }
});

test("POST /v1/notifications/send maps an APNs outage to 502", async () => {
    pushNotificationRepository.error = new PushNotificationError("APNs is temporarily unavailable.", "provider_unavailable");

    try {
        const response = await sendNotification({
            deviceToken: VALID_DEVICE_TOKEN,
            title: "Storm Warning",
            description: "Hurricane Erin may affect your area.",
        });

        assert.equal(response.status, 502);
        assert.deepEqual(await response.json(), {
            ok: false,
            code: "PUSH_UNAVAILABLE",
            reason: "Push notifications are temporarily unavailable",
        });
    } finally {
        pushNotificationRepository.error = null;
    }
});

test("POST /v1/notifications/send rejects an unparseable JSON body as a client error", async () => {
    const response = await fetch(baseUrl + "/v1/notifications/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ not json",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        ok: false,
        code: "BAD_REQUEST",
        reason: "Request body must be valid JSON.",
    });
});

test("GET /v1/notifications/send is not a route", async () => {
    const response = await fetch(baseUrl + "/v1/notifications/send");

    assert.equal(response.status, 404);
    assert.equal((await response.json()).code, "NOT_FOUND");
});

function postJson (path: string, body: unknown, method = "POST"): Promise<globalThis.Response> {
    return fetch(baseUrl + path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

test("POST /v1/devices registers a device token", async () => {
    const response = await postJson("/v1/devices", { deviceToken: VALID_DEVICE_TOKEN });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: { registered: true, alreadyRegistered: false },
        cacheStatus: "bypass",
    });
    assert.equal(deviceRepository.tokens.has(VALID_DEVICE_TOKEN), true);
});

test("POST /v1/devices does not duplicate an already registered token", async () => {
    const token = "b".repeat(64);

    const first = await postJson("/v1/devices", { deviceToken: token });
    const second = await postJson("/v1/devices", { deviceToken: token });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.deepEqual((await first.json()).data, { registered: true, alreadyRegistered: false });
    assert.deepEqual((await second.json()).data, { registered: true, alreadyRegistered: true });
    assert.equal([...deviceRepository.tokens].filter((stored) => stored === token).length, 1);
});

test("POST /v1/devices never echoes the device token", async () => {
    const response = await postJson("/v1/devices", { deviceToken: VALID_DEVICE_TOKEN });

    assert.equal(JSON.stringify(await response.json()).includes(VALID_DEVICE_TOKEN), false);
});

test("POST /v1/devices rejects an invalid device token", async (context) => {
    const invalidBodies: [string, unknown][] = [
        ["missing", {}],
        ["blank", { deviceToken: "   " }],
        ["too short", { deviceToken: "abc123" }],
        ["not hex", { deviceToken: "z".repeat(64) }],
        ["too long", { deviceToken: "a".repeat(201) }],
        ["not a string", { deviceToken: 12345 }],
        ["array body", []],
    ];

    for (const [name, body] of invalidBodies) {
        await context.test(name, async () => {
            const response = await postJson("/v1/devices", body);

            assert.equal(response.status, 400);
            assert.equal((await response.json()).code, "BAD_REQUEST");
        });
    }
});

test("POST /v1/devices reports a database outage as 503", async () => {
    deviceRepository.error = new StorageUnavailableError();

    try {
        const response = await postJson("/v1/devices", { deviceToken: VALID_DEVICE_TOKEN });

        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), {
            ok: false,
            code: "STORAGE_UNAVAILABLE",
            reason: "Storage is temporarily unavailable",
        });
    } finally {
        deviceRepository.error = null;
    }
});

test("POST /v1/storm-subscriptions subscribes a device to one storm", async () => {
    const response = await postJson("/v1/storm-subscriptions", {
        deviceToken: VALID_DEVICE_TOKEN,
        stormId: "nhc:EP072026",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: { stormId: "nhc:EP072026", subscribed: true, alreadySubscribed: false },
        cacheStatus: "bypass",
    });
});

test("POST /v1/storm-subscriptions is idempotent for the same pair", async () => {
    const token = "c".repeat(64);

    await postJson("/v1/storm-subscriptions", { deviceToken: token, stormId: "nhc:AL012026" });
    const repeat = await postJson("/v1/storm-subscriptions", { deviceToken: token, stormId: "nhc:AL012026" });

    assert.equal((await repeat.json()).data.alreadySubscribed, true);
    assert.deepEqual(
        [...stormSubscriptionRepository.pairs].filter((pair) => pair.startsWith(token + "|")),
        [token + "|nhc:AL012026"],
    );
});

test("POST /v1/storm-subscriptions accepts a GDACS storm ID", async () => {
    const response = await postJson("/v1/storm-subscriptions", {
        deviceToken: VALID_DEVICE_TOKEN,
        stormId: "gdacs:TC:1001297:51",
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.stormId, "gdacs:TC:1001297:51");
});

test("POST /v1/storm-subscriptions rejects an invalid storm ID", async (context) => {
    const invalidStormIds = [
        "not-a-storm",
        "nhc:EP0720261",
        "gdacs:TC:abc:51",
        "gdacs:TC:1001297",
        "gdacs:TC:0:51",
        "",
    ];

    for (const stormId of invalidStormIds) {
        await context.test(JSON.stringify(stormId), async () => {
            const response = await postJson("/v1/storm-subscriptions", {
                deviceToken: VALID_DEVICE_TOKEN,
                stormId,
            });

            assert.equal(response.status, 400);
            assert.equal((await response.json()).code, "BAD_REQUEST");
        });
    }
});

test("POST /v1/storm-subscriptions rejects an invalid device token", async () => {
    const response = await postJson("/v1/storm-subscriptions", {
        deviceToken: "nope",
        stormId: "nhc:EP072026",
    });

    assert.equal(response.status, 400);
});

test("POST /v1/storm-subscriptions/unsubscribe removes an existing subscription", async () => {
    const token = "d".repeat(64);

    await postJson("/v1/storm-subscriptions", { deviceToken: token, stormId: "nhc:EP072026" });
    const response = await postJson("/v1/storm-subscriptions/unsubscribe", {
        deviceToken: token,
        stormId: "nhc:EP072026",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: { stormId: "nhc:EP072026", subscribed: false, removed: true },
        cacheStatus: "bypass",
    });
});

test("POST /v1/storm-subscriptions/unsubscribe reports nothing removed when not subscribed", async () => {
    const response = await postJson("/v1/storm-subscriptions/unsubscribe", {
        deviceToken: "e".repeat(64),
        stormId: "nhc:EP072026",
    });

    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.removed, false);
});

test("POST /v1/storm-subscriptions/unsubscribe leaves other subscriptions untouched", async () => {
    const token = "f".repeat(64);

    await postJson("/v1/storm-subscriptions", { deviceToken: token, stormId: "nhc:EP072026" });
    await postJson("/v1/storm-subscriptions", { deviceToken: token, stormId: "nhc:AL022026" });
    await postJson("/v1/storm-subscriptions/unsubscribe", { deviceToken: token, stormId: "nhc:EP072026" });

    assert.equal(stormSubscriptionRepository.pairs.has(token + "|nhc:AL022026"), true);
    assert.equal(stormSubscriptionRepository.pairs.has(token + "|nhc:EP072026"), false);
});

test("PUT /v1/region-subscriptions saves a region for a device", async () => {
    const response = await postJson("/v1/region-subscriptions", {
        deviceToken: VALID_DEVICE_TOKEN,
        lat: 10.8231,
        lon: 106.6297,
        radiusKm: 300,
    }, "PUT");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: { lat: 10.8231, lon: 106.6297, radiusKm: 300, saved: true },
        cacheStatus: "bypass",
    });
});

test("PUT /v1/region-subscriptions replaces the previous region of the same device", async () => {
    const token = "1".repeat(64);

    await postJson("/v1/region-subscriptions", { deviceToken: token, lat: 10, lon: 106, radiusKm: 200 }, "PUT");
    await postJson("/v1/region-subscriptions", { deviceToken: token, lat: 21.03, lon: 105.85, radiusKm: 150 }, "PUT");

    assert.deepEqual(regionSubscriptionRepository.regions.get(token), {
        deviceToken: token,
        lat: 21.03,
        lon: 105.85,
        radiusKm: 150,
    });
});

test("PUT /v1/region-subscriptions rejects invalid coordinates and radii", async (context) => {
    const invalidBodies: [string, unknown][] = [
        ["lat too high", { deviceToken: VALID_DEVICE_TOKEN, lat: 91, lon: 106, radiusKm: 100 }],
        ["lat too low", { deviceToken: VALID_DEVICE_TOKEN, lat: -91, lon: 106, radiusKm: 100 }],
        ["lon too high", { deviceToken: VALID_DEVICE_TOKEN, lat: 10, lon: 181, radiusKm: 100 }],
        ["lon too low", { deviceToken: VALID_DEVICE_TOKEN, lat: 10, lon: -181, radiusKm: 100 }],
        ["lat missing", { deviceToken: VALID_DEVICE_TOKEN, lon: 106, radiusKm: 100 }],
        ["lon missing", { deviceToken: VALID_DEVICE_TOKEN, lat: 10, radiusKm: 100 }],
        ["lat as string", { deviceToken: VALID_DEVICE_TOKEN, lat: "10", lon: 106, radiusKm: 100 }],
        ["radius missing", { deviceToken: VALID_DEVICE_TOKEN, lat: 10, lon: 106 }],
        ["radius zero", { deviceToken: VALID_DEVICE_TOKEN, lat: 10, lon: 106, radiusKm: 0 }],
        ["radius negative", { deviceToken: VALID_DEVICE_TOKEN, lat: 10, lon: 106, radiusKm: -5 }],
        ["radius too large", { deviceToken: VALID_DEVICE_TOKEN, lat: 10, lon: 106, radiusKm: 2001 }],
        ["bad device token", { deviceToken: "nope", lat: 10, lon: 106, radiusKm: 100 }],
    ];

    for (const [name, body] of invalidBodies) {
        await context.test(name, async () => {
            const before = regionSubscriptionRepository.regions.size;
            const response = await postJson("/v1/region-subscriptions", body, "PUT");

            assert.equal(response.status, 400);
            assert.equal((await response.json()).code, "BAD_REQUEST");
            assert.equal(regionSubscriptionRepository.regions.size, before);
        });
    }
});

test("PUT /v1/region-subscriptions accepts the boundary coordinates and radii", async (context) => {
    const validBodies: [string, Record<string, unknown>][] = [
        ["south pole", { lat: -90, lon: -180, radiusKm: 1 }],
        ["north pole", { lat: 90, lon: 180, radiusKm: 2000 }],
    ];

    for (const [name, body] of validBodies) {
        await context.test(name, async () => {
            const response = await postJson("/v1/region-subscriptions", {
                deviceToken: VALID_DEVICE_TOKEN,
                ...body,
            }, "PUT");

            assert.equal(response.status, 200);
        });
    }
});

test("PUT /v1/region-subscriptions reports a database outage as 503", async () => {
    regionSubscriptionRepository.error = new StorageUnavailableError();

    try {
        const response = await postJson("/v1/region-subscriptions", {
            deviceToken: VALID_DEVICE_TOKEN,
            lat: 10,
            lon: 106,
            radiusKm: 100,
        }, "PUT");

        assert.equal(response.status, 503);
        assert.equal((await response.json()).code, "STORAGE_UNAVAILABLE");
    } finally {
        regionSubscriptionRepository.error = null;
    }
});

test("returns the rate-limited envelope after the IP quota is exhausted", async () => {
    const limitedRateLimiter = new RateLimiter({
        enabled: true,
        windowMs: 60_000,
        ipMax: 1,
    });
    const limitedServer = new Server({
        http: {
            host: "127.0.0.1",
            port: 0,
        },
    }, limitedRateLimiter, createUseCases(new TestStormRepository(), new TestSpaghettiRepository()));
    const listener = await limitedServer.listen();
    const address = listener.address();

    if (!address || typeof address === "string") {
        throw new Error("Expected the HTTP server to bind to a TCP port.");
    }

    const limitedBaseUrl = "http://127.0.0.1:" + (address as AddressInfo).port;

    try {
        const firstResponse = await fetch(limitedBaseUrl + "/health");
        const secondResponse = await fetch(limitedBaseUrl + "/health");

        assert.equal(firstResponse.status, 200);
        assert.equal(secondResponse.status, 429);
        assert.deepEqual(await secondResponse.json(), {
            ok: false,
            code: "RATE_LIMITED",
            reason: "Too many requests",
        });
    } finally {
        limitedRateLimiter.dispose();
        await limitedServer.close();
    }
});

function createUseCases (
    repository: StormRepository,
    spaghetti: SpaghettiRepository,
    forecastWeather: ForecastWeatherRepository = new TestForecastWeatherRepository(),
    mapTile: MapTileRepository = new TestMapTileRepository(),
    radar: RadarRepository = new TestRadarRepository(),
    historicalStormTrack: HistoricalStormTrackRepository = new TestHistoricalStormTrackRepository(),
    currentWeather: CurrentWeatherRepository = new TestCurrentWeatherRepository(),
    pushNotification: PushNotificationRepository = new TestPushNotificationRepository(),
    device: DeviceRepository = new MemoryDeviceRepository(),
    stormSubscription: StormSubscriptionRepository = new MemoryStormSubscriptionRepository(),
    regionSubscription: RegionSubscriptionRepository = new MemoryRegionSubscriptionRepository(),
) {
    return {
        storm: {
            getActiveStorms: new GetActiveStormsUseCase(repository),
            getDemoStorms: new GetDemoStormsUseCase(historicalStormTrack),
            getTrackedStorms: new GetTrackedStormsUseCase(repository, historicalStormTrack),
            getStormTrack: new GetStormTrackUseCase(repository),
            getStormCone: new GetStormConeUseCase(repository),
            getStormSpaghetti: new GetStormSpaghettiUseCase(spaghetti),
            getHistoricalStormTrack: new GetHistoricalStormTrackUseCase(historicalStormTrack),
        },
        weather: {
            getForecastWeather: new GetForecastWeatherUseCase(forecastWeather),
            getCurrentWeather: new GetCurrentWeatherUseCase(currentWeather),
        },
        map: {
            getMapTile: new GetMapTileUseCase(mapTile),
        },
        radar: {
            getRadar: new GetRadarUseCase(radar),
        },
        notification: {
            sendPushNotification: new SendPushNotificationUseCase(pushNotification),
        },
        device: {
            registerDevice: new RegisterDeviceUseCase(device),
        },
        subscription: {
            subscribeToStorm: new SubscribeToStormUseCase(stormSubscription),
            unsubscribeFromStorm: new UnsubscribeFromStormUseCase(stormSubscription),
            saveRegionSubscription: new SaveRegionSubscriptionUseCase(regionSubscription),
        },
    };
}
