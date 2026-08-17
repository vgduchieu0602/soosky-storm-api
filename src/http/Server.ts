import http from "node:http";
import express, { NextFunction, Request, RequestHandler, Response } from "express";
import StormNotFoundError from "../domain/errors/StormNotFoundError.js";
import StormProviderError from "../domain/errors/StormProviderError.js";
import GetActiveStormsUseCase from "../domain/use-cases/storm/GetActiveStormsUseCase.js";
import GetDemoStormsUseCase from "../domain/use-cases/storm/GetDemoStormsUseCase.js";
import GetTrackedStormsUseCase from "../domain/use-cases/storm/GetTrackedStormsUseCase.js";
import GetStormConeUseCase from "../domain/use-cases/storm/GetStormConeUseCase.js";
import GetStormSpaghettiUseCase from "../domain/use-cases/storm/GetStormSpaghettiUseCase.js";
import GetStormTrackUseCase from "../domain/use-cases/storm/GetStormTrackUseCase.js";
import GetForecastWeatherUseCase from "../domain/use-cases/weather/GetForecastWeatherUseCase.js";
import { ForecastUnits } from "../domain/entities/ForecastWeather.js";
import { MAP_LAYERS, MAX_MAP_ZOOM, MapLayer } from "../domain/entities/MapTile.js";
import { StormSource } from "../domain/entities/StormSummary.js";
import GetCurrentWeatherUseCase from "../domain/use-cases/weather/GetCurrentWeatherUseCase.js";
import GetMapTileUseCase from "../domain/use-cases/map/GetMapTileUseCase.js";
import GetRadarUseCase from "../domain/use-cases/radar/GetRadarUseCase.js";
import SendPushNotificationUseCase from "../domain/use-cases/notification/SendPushNotificationUseCase.js";
import PushNotificationError from "../domain/errors/PushNotificationError.js";
import PushNotification from "../domain/entities/PushNotification.js";
import { STORM_ALERT_TYPES, StormAlertType } from "../domain/entities/StormAlert.js";
import StorageUnavailableError from "../domain/errors/StorageUnavailableError.js";
import { isDeviceToken } from "../domain/entities/Device.js";
import { MAX_REGION_RADIUS_KM, MIN_REGION_RADIUS_KM } from "../domain/entities/RegionSubscription.js";
import RegisterDeviceUseCase from "../domain/use-cases/device/RegisterDeviceUseCase.js";
import SubscribeToStormUseCase from "../domain/use-cases/subscription/SubscribeToStormUseCase.js";
import UnsubscribeFromStormUseCase from "../domain/use-cases/subscription/UnsubscribeFromStormUseCase.js";
import SaveRegionSubscriptionUseCase from "../domain/use-cases/subscription/SaveRegionSubscriptionUseCase.js";
import GetHistoricalStormTrackUseCase from "../domain/use-cases/storm/GetHistoricalStormTrackUseCase.js";
import ClientError from "./ClientError.js";
import { getCacheStatus } from "../domain/cacheStatus.js";
import formatResponseData from "./formatResponseData.js";
import formatStormTrackResponse from "./formatStormTrackResponse.js";
import formatStormSummaryResponse from "./formatStormSummaryResponse.js";
import formatTrackedStormResponse from "./formatTrackedStormResponse.js";
import RateLimiter from "./RateLimiter.js";

export { Server as default };
export type { ServerConfig, ServerUseCases };

interface ServerConfig {
    readonly http: {
        readonly host: string;
        readonly port: number;
        readonly trustProxy?: boolean | number | string;
    };
}

interface ServerUseCases {
    storm: {
        getActiveStorms: GetActiveStormsUseCase;
        getDemoStorms: GetDemoStormsUseCase;
        getTrackedStorms: GetTrackedStormsUseCase;
        getStormTrack: GetStormTrackUseCase;
        getStormCone: GetStormConeUseCase;
        getStormSpaghetti: GetStormSpaghettiUseCase;
        getHistoricalStormTrack: GetHistoricalStormTrackUseCase;
    };
    weather: {
        getForecastWeather: GetForecastWeatherUseCase;
        getCurrentWeather: GetCurrentWeatherUseCase;
    };
    map: {
        getMapTile: GetMapTileUseCase;
    };
    radar: {
        getRadar: GetRadarUseCase;
    };
    notification: {
        sendPushNotification: SendPushNotificationUseCase;
    };
    device: {
        registerDevice: RegisterDeviceUseCase;
    };
    subscription: {
        subscribeToStorm: SubscribeToStormUseCase;
        unsubscribeFromStorm: UnsubscribeFromStormUseCase;
        saveRegionSubscription: SaveRegionSubscriptionUseCase;
    };
}

type Route = readonly ["get" | "post" | "put", string, RequestHandler];

type StormRegion = "all" | "us-nhc" | "gdacs";

const NHC_STORM_ID_PATTERN = /^nhc:[A-Z]{2}\d{6}$/;
const NHC_SUPPORTED_STORM_ID_PATTERN = /^nhc:(AL|EP|CP)\d{6}$/;
const GDACS_STORM_ID_PATTERN = /^gdacs:TC:[1-9]\d*:[1-9]\d*$/;
/** Push failures are reported without any APNs reason, key, or token detail. */
const PUSH_ERROR_RESPONSES = {
    invalid_device_token: {
        status: 400,
        code: "INVALID_DEVICE_TOKEN",
        reason: "The device token was rejected",
    },
    not_configured: {
        status: 503,
        code: "PUSH_NOT_CONFIGURED",
        reason: "Push notifications are not configured",
    },
    provider_unavailable: {
        status: 502,
        code: "PUSH_UNAVAILABLE",
        reason: "Push notifications are temporarily unavailable",
    },
} as const;

const REGION_SOURCES: Readonly<Record<"us-nhc" | "gdacs", StormSource>> = {
    "us-nhc": "nhc",
    gdacs: "gdacs",
};

class Server {
    private readonly _server = express();
    private _listener: http.Server | null = null;

    private readonly _routes: Route[] = [
        ["get", "/health", this._GET_health],
        ["get", "/v1/storms", this._GET_storms],
        ["get", "/v1/storms/demo", this._GET_demoStorms],
        ["post", "/v1/storms/tracking", this._POST_trackedStorms],
        ["get", "/v1/weather/forecast", this._GET_forecastWeather],
        ["get", "/v1/weather/current", this._GET_currentWeather],
        ["get", "/v1/map-tiles/:layer/:z/:x/:y", this._GET_mapTile],
        ["get", "/v1/radar", this._GET_radar],
        ["get", "/v1/storms/:stormId/track", this._GET_stormTrack],
        ["get", "/v1/storms/:stormId/cone", this._GET_stormCone],
        ["get", "/v1/storms/:stormId/spaghetti", this._GET_stormSpaghetti],
        ["get", "/v1/storms/:stormId/history-track", this._GET_historicalStormTrack],
        ["post", "/v1/notifications/send", this._POST_sendNotification],
        ["post", "/v1/devices", this._POST_registerDevice],
        ["post", "/v1/storm-subscriptions", this._POST_subscribeToStorm],
        ["post", "/v1/storm-subscriptions/unsubscribe", this._POST_unsubscribeFromStorm],
        ["put", "/v1/region-subscriptions", this._PUT_regionSubscription],
    ];

    public constructor (
        private readonly _config: ServerConfig,
        private readonly _rateLimiter: RateLimiter,
        private readonly _useCases: ServerUseCases,
        private readonly _getDatabaseStatus: () => string = () => "unknown",
    ) {
        this._registerRouter();
        this._registerErrorHandler();
    }

    public listen (): Promise<http.Server> {
        return new Promise((resolve, reject) => {
            const listener = this._server.listen(this._config.http.port, this._config.http.host);

            listener.once("listening", () => {
                listener.removeAllListeners("error");
                this._listener = listener;
                resolve(listener);
            });
            listener.once("error", (error) => {
                reject(error);
            });
        });
    }

    public close (): Promise<void> {
        if (!this._listener) {
            return Promise.resolve();
        }

        const listener = this._listener;

        return new Promise((resolve, reject) => {
            listener.close((error) => {
                this._listener = null;

                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }

    private _registerRouter (): void {
        this._server.set("trust proxy", this._config.http.trustProxy ?? 1);
        this._server.use(express.json({ limit: "64kb" }));
        this._server.use((request: Request, response: Response, next: NextFunction) => {
            const scope = this._rateLimiter.check(request.ip ?? "unknown");

            if (!scope) {
                next();
                return;
            }

            response.status(429).json({
                ok: false,
                code: "RATE_LIMITED",
                reason: "Too many requests",
            });
        });

        for (const [method, path, handler] of this._routes) {
            this._server[method](path, handler.bind(this));
        }

        this._server.use(() => {
            throw new ClientError("Route not found", 404, "NOT_FOUND");
        });
    }

    private _registerErrorHandler (): void {
        this._server.use((
            error: unknown,
            _request: Request,
            response: Response,
            _next: NextFunction,
        ) => {
            switch (true) {
                case error instanceof StormNotFoundError:
                    response.status(404).json({
                        ok: false,
                        code: "STORM_NOT_FOUND",
                        reason: error.message,
                    });
                    return;
                case error instanceof StormProviderError:
                    response.status(502).json({
                        ok: false,
                        code: "UPSTREAM_UNAVAILABLE",
                        reason: "Storm data is temporarily unavailable",
                        cacheStatus: "upstream",
                    });
                    return;
                case isRequestBodyError(error):
                    response.status(error.status === 413 ? 413 : 400).json({
                        ok: false,
                        code: error.status === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
                        reason: error.status === 413
                            ? "Request body is too large."
                            : "Request body must be valid JSON.",
                    });
                    return;
                case error instanceof StorageUnavailableError:
                    response.status(503).json({
                        ok: false,
                        code: "STORAGE_UNAVAILABLE",
                        reason: "Storage is temporarily unavailable",
                    });
                    return;
                case error instanceof PushNotificationError:
                    response.status(PUSH_ERROR_RESPONSES[error.kind].status).json({
                        ok: false,
                        code: PUSH_ERROR_RESPONSES[error.kind].code,
                        reason: PUSH_ERROR_RESPONSES[error.kind].reason,
                    });
                    return;
                case error instanceof ClientError:
                    response.status(error.statusCode).json({
                        ok: false,
                        code: error.code,
                        reason: error.message,
                    });
                    return;
                default:
                    console.error(error);
                    response.status(500).json({
                        ok: false,
                        code: "INTERNAL_SERVER_ERROR",
                        reason: "An unexpected error occurred",
                    });
            }
        });
    }

    private _GET_health (_request: Request, response: Response): void {
        this._sendData(response, formatResponseData({
            service: "soosky-storm-api",
            database: this._getDatabaseStatus(),
        }));
    }

    private async _GET_storms (request: Request, response: Response): Promise<void> {
        const region = request.query.region === undefined ? "all" : request.query.region;

        if (!isStormRegion(region)) {
            throw new ClientError("Query param 'region' must be 'us-nhc', 'gdacs', or 'all'.");
        }

        const data = await this._useCases.storm.getActiveStorms.execute(
            region === "all" ? {} : { source: REGION_SOURCES[region] },
        );

        this._sendData(response, data.map(formatStormSummaryResponse), data);
    }

    private async _GET_demoStorms (_request: Request, response: Response): Promise<void> {
        const data = await this._useCases.storm.getDemoStorms.execute();

        this._sendData(response, data.map(formatStormSummaryResponse), data);
    }

    private async _POST_trackedStorms (request: Request, response: Response): Promise<void> {
        const data = await this._useCases.storm.getTrackedStorms.execute({
            stormIds: readStormIds(readJsonObject(request)),
        });

        this._sendData(response, data.map(formatTrackedStormResponse), data);
    }

    private async _GET_forecastWeather (request: Request, response: Response): Promise<void> {
        const { lat, lon, units } = parseWeatherQuery(request);
        const data = await this._useCases.weather.getForecastWeather.execute({ lat, lon, units });

        this._sendData(response, data);
    }

    private async _GET_currentWeather (request: Request, response: Response): Promise<void> {
        const { lat, lon, units } = parseWeatherQuery(request);
        const data = await this._useCases.weather.getCurrentWeather.execute({ lat, lon, units });

        this._sendData(response, data);
    }

    private async _POST_sendNotification (request: Request, response: Response): Promise<void> {
        const payload = readJsonObject(request);
        const notification: PushNotification = {
            deviceToken: readRequiredField(payload, "deviceToken", 200),
            title: readRequiredField(payload, "title", 256),
            description: readRequiredField(payload, "description", 2048),
        };
        const stormId = readOptionalStormId(payload);
        const alertType = readOptionalAlertType(payload);

        if (stormId !== null) {
            notification.stormId = stormId;
        }

        if (alertType !== null) {
            notification.type = alertType;
        }

        const data = await this._useCases.notification.sendPushNotification.execute(notification);

        this._sendData(response, data);
    }

    private async _POST_registerDevice (request: Request, response: Response): Promise<void> {
        const body = readJsonObject(request);
        const data = await this._useCases.device.registerDevice.execute({
            deviceToken: readDeviceToken(body),
        });

        this._sendData(response, data);
    }

    private async _POST_subscribeToStorm (request: Request, response: Response): Promise<void> {
        const body = readJsonObject(request);
        const data = await this._useCases.subscription.subscribeToStorm.execute({
            deviceToken: readDeviceToken(body),
            stormId: readStormId(body),
        });

        this._sendData(response, data);
    }

    private async _POST_unsubscribeFromStorm (request: Request, response: Response): Promise<void> {
        const body = readJsonObject(request);
        const data = await this._useCases.subscription.unsubscribeFromStorm.execute({
            deviceToken: readDeviceToken(body),
            stormId: readStormId(body),
        });

        this._sendData(response, data);
    }

    private async _PUT_regionSubscription (request: Request, response: Response): Promise<void> {
        const body = readJsonObject(request);
        const data = await this._useCases.subscription.saveRegionSubscription.execute({
            deviceToken: readDeviceToken(body),
            lat: readCoordinateField(body, "lat", -90, 90),
            lon: readCoordinateField(body, "lon", -180, 180),
            radiusKm: readRadiusKm(body),
        });

        this._sendData(response, data);
    }

    private async _GET_mapTile (request: Request, response: Response): Promise<void> {
        const layer = request.params.layer;
        const z = parseTileCoordinate(request.params.z);
        const x = parseTileCoordinate(request.params.x);
        const y = parseTileCoordinate(request.params.y);

        if (typeof layer !== "string" || !isMapLayer(layer)) {
            throw new ClientError("Path param 'layer' is invalid.");
        }

        if (z === null || x === null || y === null || z > MAX_MAP_ZOOM) {
            throw new ClientError("Path params 'z', 'x', and 'y' are invalid.");
        }

        const maxCoordinate = 2 ** z - 1;

        if (x < 0 || x > maxCoordinate || y < 0 || y > maxCoordinate) {
            throw new ClientError("Path params 'x' and 'y' are invalid for this zoom.");
        }

        const tile = await this._useCases.map.getMapTile.execute({ layer, z, x, y });

        response.set("Content-Type", tile.contentType);
        response.send(tile.buffer);
    }

    private async _GET_radar (_request: Request, response: Response): Promise<void> {
        const data = await this._useCases.radar.getRadar.execute();

        this._sendData(response, data);
    }

    private async _GET_stormTrack (request: Request, response: Response): Promise<void> {
        const stormId = request.params.stormId;

        if (typeof stormId !== "string" || !isTrackStormId(stormId)) {
            throw new ClientError("Path param 'stormId' is invalid.");
        }

        const data = await this._useCases.storm.getStormTrack.execute({ stormId });

        this._sendData(response, formatStormTrackResponse(data), data);
    }

    private async _GET_stormCone (request: Request, response: Response): Promise<void> {
        const stormId = request.params.stormId;

        if (typeof stormId !== "string" || !isConeStormId(stormId)) {
            throw new ClientError("Path param 'stormId' is invalid.");
        }

        const data = await this._useCases.storm.getStormCone.execute({ stormId });

        this._sendData(response, data);
    }

    private async _GET_stormSpaghetti (request: Request, response: Response): Promise<void> {
        const stormId = request.params.stormId;

        if (typeof stormId !== "string" || !/^nhc:[A-Z]{2}\d{6}$/.test(stormId)) {
            throw new ClientError("Path param 'stormId' is invalid.");
        }

        const data = await this._useCases.storm.getStormSpaghetti.execute({ stormId });

        this._sendData(response, data);
    }

    private async _GET_historicalStormTrack (request: Request, response: Response): Promise<void> {
        const stormId = request.params.stormId;

        if (typeof stormId !== "string" || !isHistoricalStormId(stormId)) {
            throw new ClientError("Path param 'stormId' is invalid.");
        }

        const data = await this._useCases.storm.getHistoricalStormTrack.execute({ stormId });

        this._sendData(response, data);
    }

    private _sendData (response: Response, data: unknown, cacheSource: unknown = data): void {
        response.json({
            ok: true,
            data,
            cacheStatus: getCacheStatus(cacheSource) ?? "bypass",
        });
    }
}

function isConeStormId (stormId: string): boolean {
    return NHC_STORM_ID_PATTERN.test(stormId) || GDACS_STORM_ID_PATTERN.test(stormId);
}

function isTrackStormId (stormId: string): boolean {
    return NHC_STORM_ID_PATTERN.test(stormId) || GDACS_STORM_ID_PATTERN.test(stormId);
}

function isHistoricalStormId (stormId: string): boolean {
    return NHC_SUPPORTED_STORM_ID_PATTERN.test(stormId) || GDACS_STORM_ID_PATTERN.test(stormId);
}

function isStormRegion (value: unknown): value is StormRegion {
    return value === "all" || value === "us-nhc" || value === "gdacs";
}

/** body-parser rejects unparseable or oversized bodies; those are client errors, not faults. */
function isRequestBodyError (error: unknown): error is { status: number } {
    if (!(error instanceof Error)) {
        return false;
    }

    const candidate = error as unknown as { type?: unknown; status?: unknown };

    return typeof candidate.type === "string"
        && candidate.type.startsWith("entity.")
        && typeof candidate.status === "number";
}

function readJsonObject (request: Request): Record<string, unknown> {
    const body: unknown = request.body;

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new ClientError("Request body must be a JSON object.");
    }

    return body as Record<string, unknown>;
}

function readDeviceToken (body: Record<string, unknown>): string {
    const deviceToken = body.deviceToken;

    if (!isDeviceToken(deviceToken)) {
        throw new ClientError("Field 'deviceToken' must be a valid APNs device token.");
    }

    return deviceToken;
}

function readStormId (body: Record<string, unknown>): string {
    const stormId = body.stormId;

    if (typeof stormId !== "string" || !isTrackStormId(stormId)) {
        throw new ClientError("Field 'stormId' is invalid.");
    }

    return stormId;
}

function readOptionalStormId (body: Record<string, unknown>): string | null {
    const stormId = body.stormId;

    if (stormId === undefined || stormId === null) {
        return null;
    }

    if (typeof stormId !== "string" || !isTrackStormId(stormId)) {
        throw new ClientError("Field 'stormId' is invalid.");
    }

    return stormId;
}

function readOptionalAlertType (body: Record<string, unknown>): StormAlertType | null {
    const type = body.type;

    if (type === undefined || type === null) {
        return null;
    }

    if (!STORM_ALERT_TYPES.some((alertType) => alertType === type)) {
        throw new ClientError("Field 'type' must be one of: " + STORM_ALERT_TYPES.join(", ") + ".");
    }

    return type as StormAlertType;
}

function readStormIds (body: Record<string, unknown>): string[] {
    const stormIds = body.stormIds;

    if (
        !Array.isArray(stormIds)
        || stormIds.length === 0
        || stormIds.length > 20
        || stormIds.some((stormId) => typeof stormId !== "string" || !isTrackStormId(stormId))
    ) {
        throw new ClientError("Field 'stormIds' must be an array containing 1 to 20 valid storm IDs.");
    }

    return stormIds;
}

function readCoordinateField (body: Record<string, unknown>, name: string, min: number, max: number): number {
    const value = body[name];

    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
        throw new ClientError("Field '" + name + "' must be a number between " + min + " and " + max + ".");
    }

    return value;
}

function readRadiusKm (body: Record<string, unknown>): number {
    const radiusKm = body.radiusKm;

    if (
        typeof radiusKm !== "number"
        || !Number.isFinite(radiusKm)
        || radiusKm < MIN_REGION_RADIUS_KM
        || radiusKm > MAX_REGION_RADIUS_KM
    ) {
        throw new ClientError(
            "Field 'radiusKm' must be a number between "
            + MIN_REGION_RADIUS_KM + " and " + MAX_REGION_RADIUS_KM + ".",
        );
    }

    return radiusKm;
}

function readRequiredField (body: Record<string, unknown>, name: string, maxLength: number): string {
    const value = body[name];

    if (typeof value !== "string" || !value.trim()) {
        throw new ClientError("Field '" + name + "' is required.");
    }

    const trimmed = value.trim();

    if (trimmed.length > maxLength) {
        throw new ClientError("Field '" + name + "' must be at most " + maxLength + " characters.");
    }

    return trimmed;
}

function parseWeatherQuery (request: Request): { lat: number; lon: number; units: ForecastUnits } {
    if (!isNonEmptyQueryParam(request.query.lat) || !isNonEmptyQueryParam(request.query.lon)) {
        throw new ClientError("Query params 'lat' and 'lon' are required.");
    }

    const lat = parseCoordinate(request.query.lat, -90, 90);
    const lon = parseCoordinate(request.query.lon, -180, 180);

    if (lat === null || lon === null) {
        throw new ClientError("Query params 'lat' and 'lon' must be valid decimal coordinates.");
    }

    const units = request.query.units === undefined ? "metric" : request.query.units;

    if (!isForecastUnits(units)) {
        throw new ClientError("Query param 'units' must be 'standard', 'metric', or 'imperial'.");
    }

    return { lat, lon, units };
}

function isNonEmptyQueryParam (value: unknown): value is string {
    return typeof value === "string" && Boolean(value.trim());
}

function parseCoordinate (value: string, min: number, max: number): number | null {

    const coordinate = Number(value);

    if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
        return null;
    }

    return coordinate;
}

function isForecastUnits (value: unknown): value is ForecastUnits {
    return value === "standard" || value === "metric" || value === "imperial";
}

function isMapLayer (value: string): value is MapLayer {
    return (MAP_LAYERS as readonly string[]).includes(value);
}

function parseTileCoordinate (value: unknown): number | null {
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        return null;
    }

    const coordinate = Number(value);

    return Number.isSafeInteger(coordinate) ? coordinate : null;
}
