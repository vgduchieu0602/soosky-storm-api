import http from "node:http";
import express, { NextFunction, Request, RequestHandler, Response } from "express";
import StormNotFoundError from "../domain/errors/StormNotFoundError.js";
import StormProviderError from "../domain/errors/StormProviderError.js";
import GetActiveStormsUseCase from "../domain/use-cases/storm/GetActiveStormsUseCase.js";
import GetStormConeUseCase from "../domain/use-cases/storm/GetStormConeUseCase.js";
import GetStormSpaghettiUseCase from "../domain/use-cases/storm/GetStormSpaghettiUseCase.js";
import GetStormTrackUseCase from "../domain/use-cases/storm/GetStormTrackUseCase.js";
import GetForecastWeatherUseCase from "../domain/use-cases/weather/GetForecastWeatherUseCase.js";
import ClientError from "./ClientError.js";
import formatResponseData from "./formatResponseData.js";
import RateLimiter from "./RateLimiter.js";

export { Server as default };
export type { ServerConfig, ServerUseCases };

interface ServerConfig {
    readonly http: {
        readonly host: string;
        readonly port: number;
    };
}

interface ServerUseCases {
    storm: {
        getActiveStorms: GetActiveStormsUseCase;
        getStormTrack: GetStormTrackUseCase;
        getStormCone: GetStormConeUseCase;
        getStormSpaghetti: GetStormSpaghettiUseCase;
    };
    weather: {
        getForecastWeather: GetForecastWeatherUseCase;
    };
}

type Route = readonly ["get", string, RequestHandler];

class Server {
    private readonly _server = express();
    private _listener: http.Server | null = null;

    private readonly _routes: Route[] = [
        ["get", "/health", this._GET_health],
        ["get", "/v1/storms", this._GET_storms],
        ["get", "/v1/weather/forecast", this._GET_forecastWeather],
        ["get", "/v1/storms/:stormId/track", this._GET_stormTrack],
        ["get", "/v1/storms/:stormId/cone", this._GET_stormCone],
        ["get", "/v1/storms/:stormId/spaghetti", this._GET_stormSpaghetti],
    ];

    public constructor (
        private readonly _config: ServerConfig,
        private readonly _rateLimiter: RateLimiter,
        private readonly _useCases: ServerUseCases,
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
        this._server.set("trust proxy", 1);
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
        response.json({
            ok: true,
            data: formatResponseData({
                service: "soosky-storm-api",
                database: "connected",
            }),
        });
    }

    private async _GET_storms (request: Request, response: Response): Promise<void> {
        if (request.query.region !== "us-nhc") {
            throw new ClientError("Query param 'region' must be 'us-nhc'.");
        }

        const data = await this._useCases.storm.getActiveStorms.execute();

        response.json({ ok: true, data });
    }

    private async _GET_forecastWeather (request: Request, response: Response): Promise<void> {
        const lat = parseCoordinate(request.query.lat, "lat", -90, 90);
        const lon = parseCoordinate(request.query.lon, "lon", -180, 180);
        const units = request.query.units === undefined ? "metric" : request.query.units;

        if (!isForecastUnits(units)) {
            throw new ClientError("Query param 'units' must be 'standard', 'metric', or 'imperial'.");
        }

        const data = await this._useCases.weather.getForecastWeather.execute({ lat, lon, units });

        response.json({ ok: true, data });
    }

    private async _GET_stormTrack (request: Request, response: Response): Promise<void> {
        const stormId = request.params.stormId;

        if (typeof stormId !== "string" || !/^nhc:[A-Z]{2}\d{6}$/.test(stormId)) {
            throw new ClientError("Path param 'stormId' is invalid.");
        }

        const data = await this._useCases.storm.getStormTrack.execute({ stormId });

        response.json({ ok: true, data });
    }

    private async _GET_stormCone (request: Request, response: Response): Promise<void> {
        const stormId = request.params.stormId;

        if (typeof stormId !== "string" || !isConeStormId(stormId)) {
            throw new ClientError("Path param 'stormId' is invalid.");
        }

        const data = await this._useCases.storm.getStormCone.execute({ stormId });

        response.json({ ok: true, data });
    }

    private async _GET_stormSpaghetti (request: Request, response: Response): Promise<void> {
        const stormId = request.params.stormId;

        if (typeof stormId !== "string" || !/^nhc:[A-Z]{2}\d{6}$/.test(stormId)) {
            throw new ClientError("Path param 'stormId' is invalid.");
        }

        const data = await this._useCases.storm.getStormSpaghetti.execute({ stormId });

        response.json({ ok: true, data });
    }
}

function isConeStormId (stormId: string): boolean {
    return /^nhc:[A-Z]{2}\d{6}$/.test(stormId) || /^gdacs:TC:[1-9]\d*:[1-9]\d*$/.test(stormId);
}

function parseCoordinate (value: unknown, name: string, min: number, max: number): number {
    if (typeof value !== "string" || !value.trim()) {
        throw new ClientError("Query param '" + name + "' is invalid.");
    }

    const coordinate = Number(value);

    if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
        throw new ClientError("Query param '" + name + "' is invalid.");
    }

    return coordinate;
}

function isForecastUnits (value: unknown): value is "standard" | "metric" | "imperial" {
    return value === "standard" || value === "metric" || value === "imperial";
}
