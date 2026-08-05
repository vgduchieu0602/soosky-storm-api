import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import test, { after, before } from "node:test";
import StormSummary from "../src/domain/entities/StormSummary.js";
import StormCone from "../src/domain/entities/StormCone.js";
import StormTrack from "../src/domain/entities/StormTrack.js";
import StormSpaghetti from "../src/domain/entities/StormSpaghetti.js";
import ForecastWeather from "../src/domain/entities/ForecastWeather.js";
import StormNotFoundError from "../src/domain/errors/StormNotFoundError.js";
import StormProviderError from "../src/domain/errors/StormProviderError.js";
import SpaghettiRepository from "../src/domain/repositories/ISpaghettiRepository.js";
import StormRepository from "../src/domain/repositories/IStormRepository.js";
import ForecastWeatherRepository, { ForecastWeatherQuery } from "../src/domain/repositories/IForecastWeatherRepository.js";
import GetActiveStormsUseCase from "../src/domain/use-cases/storm/GetActiveStormsUseCase.js";
import GetStormConeUseCase from "../src/domain/use-cases/storm/GetStormConeUseCase.js";
import GetStormSpaghettiUseCase from "../src/domain/use-cases/storm/GetStormSpaghettiUseCase.js";
import GetStormTrackUseCase from "../src/domain/use-cases/storm/GetStormTrackUseCase.js";
import GetForecastWeatherUseCase from "../src/domain/use-cases/weather/GetForecastWeatherUseCase.js";
import RateLimiter from "../src/http/RateLimiter.js";
import Server from "../src/http/Server.js";

let server: Server;
let rateLimiter: RateLimiter;
let stormRepository: TestStormRepository;
let spaghettiRepository: TestSpaghettiRepository;
let forecastWeatherRepository: TestForecastWeatherRepository;
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
        category: "tropical_storm",
    };

    public readonly track: StormTrack = {
        stormId: "nhc:EP072026",
        name: "Genevieve",
        source: "nhc",
        issuedAt: "2026-07-31T21:00:00.000Z",
        cachedUntil: "2026-07-31T23:00:00.000Z",
        observed: [],
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

    public async getActiveStorms (): Promise<StormSummary[]> {
        return [this.summary];
    }

    public async getStormTrack (_stormId: string): Promise<StormTrack> {
        if (this.trackError) {
            throw this.trackError;
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
        hourly: [],
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

before(async () => {
    rateLimiter = new RateLimiter({
        enabled: false,
        windowMs: 60_000,
        globalMax: 10,
        ipMax: 10,
    });
    stormRepository = new TestStormRepository();
    spaghettiRepository = new TestSpaghettiRepository();
    forecastWeatherRepository = new TestForecastWeatherRepository();
    server = new Server({
        http: {
            host: "127.0.0.1",
            port: 0,
        },
    }, rateLimiter, createUseCases(stormRepository, spaghettiRepository, forecastWeatherRepository));

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
    });
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
        data: [stormRepository.summary],
    });
});

test("GET /v1/storms rejects an unsupported region", async () => {
    const response = await fetch(baseUrl + "/v1/storms?region=western-north-pacific");

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
        ok: false,
        code: "BAD_REQUEST",
        reason: "Query param 'region' must be 'us-nhc'.",
    });
});

test("GET /v1/weather/forecast returns metric weather by default", async () => {
    const response = await fetch(baseUrl + "/v1/weather/forecast?lat=10.8231&lon=106.6297");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: forecastWeatherRepository.forecast,
    });
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

test("GET /v1/weather/forecast maps an upstream error to 502", async () => {
    forecastWeatherRepository.error = new StormProviderError("OpenWeather timed out.");

    try {
        const response = await fetch(baseUrl + "/v1/weather/forecast?lat=10&lon=106");

        assert.equal(response.status, 502);
    } finally {
        forecastWeatherRepository.error = null;
    }
});

test("GET /v1/storms/:stormId/track returns the normalized track", async () => {
    const response = await fetch(baseUrl + "/v1/storms/nhc:EP072026/track");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        ok: true,
        data: stormRepository.track,
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

test("returns the rate-limited envelope after the IP quota is exhausted", async () => {
    const limitedRateLimiter = new RateLimiter({
        enabled: true,
        windowMs: 60_000,
        globalMax: 10,
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
) {
    return {
        storm: {
            getActiveStorms: new GetActiveStormsUseCase(repository),
            getStormTrack: new GetStormTrackUseCase(repository),
            getStormCone: new GetStormConeUseCase(repository),
            getStormSpaghetti: new GetStormSpaghettiUseCase(spaghetti),
        },
        weather: {
            getForecastWeather: new GetForecastWeatherUseCase(forecastWeather),
        },
    };
}
