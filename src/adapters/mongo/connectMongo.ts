import mongoose from "mongoose";
import config from "../../config.js";

export { connectMongo as default };
export { connectMongoInBackground, getDatabaseStatus };
export type { ConnectMongoInBackgroundOptions, DatabaseStatus };

type DatabaseStatus = "connected" | "connecting" | "disconnecting" | "disconnected";

interface ConnectMongoInBackgroundOptions {
    connect?: () => Promise<void>;
    scheduleRetry?: (retry: () => void, delayMs: number) => void;
    logError?: (message: string) => void;
}

const RETRY_DELAY_MS = 30_000;

async function connectMongo (): Promise<void> {
    if (!config.mongo.uri) {
        throw new Error("MONGO_URI is required.");
    }

    await mongoose.connect(config.mongo.uri);
    console.log("Mongo connected.");
}

async function connectMongoInBackground (options: ConnectMongoInBackgroundOptions = {}): Promise<void> {
    const connect = options.connect ?? connectMongo;
    const scheduleRetry = options.scheduleRetry ?? defaultScheduleRetry;
    const logError = options.logError ?? ((message: string) => console.error(message));

    try {
        await connect();
    } catch (error) {
        logError("Mongo connection failed: " + toErrorMessage(error));
        scheduleRetry(() => {
            void connectMongoInBackground(options);
        }, RETRY_DELAY_MS);
    }
}

function getDatabaseStatus (): DatabaseStatus {
    switch (mongoose.connection.readyState) {
        case 1:
            return "connected";
        case 2:
            return "connecting";
        case 3:
            return "disconnecting";
        default:
            return "disconnected";
    }
}

function defaultScheduleRetry (retry: () => void, delayMs: number): void {
    const timer = setTimeout(retry, delayMs);

    timer.unref();
}

function toErrorMessage (error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
