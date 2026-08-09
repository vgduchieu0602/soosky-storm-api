import dotenv from "dotenv";

export { config as default };

class InvalidEnvVarError extends Error {
    public constructor (key: string, expectation: string) {
        super("Environment variable [" + key + "] must be " + expectation + ".");
        this.name = "InvalidEnvVarError";
    }
}

dotenv.config({
    encoding: "utf-8",
    override: false,
});

const config = {
    http: {
        port: readPositiveInt("HTTP_PORT", 3000),
        host: process.env.HTTP_HOST || "0.0.0.0",
        trustProxy: readTrustProxy(),
    },
    mongo: {
        uri: process.env.MONGO_URI,
    },
    nhc: {
        currentStormsUrl: process.env.NHC_CURRENT_STORMS_URL || "https://www.nhc.noaa.gov/CurrentStorms.json",
        aidPublicUrl: process.env.NHC_ATCF_AID_PUBLIC_URL || "https://ftp.nhc.noaa.gov/atcf/aid_public",
        archiveUrl: process.env.NHC_ATCF_ARCHIVE_URL || "https://ftp.nhc.noaa.gov/atcf/archive",
        cacheTtlMs: readPositiveInt("NHC_CACHE_TTL_MS", 7_200_000),
    },
    gdacs: {
        geometryUrl: process.env.GDACS_GEOMETRY_URL || "https://www.gdacs.org/gdacsapi/api/polygons/getgeometry",
        eventListUrl: process.env.GDACS_EVENT_LIST_URL || "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH",
        eventDataUrl: process.env.GDACS_EVENT_DATA_URL || "https://www.gdacs.org/gdacsapi/api/events/geteventdata",
    },
    openWeather: {
        apiKey: process.env.OPENWEATHER_API_KEY,
    },
    apns: {
        teamId: process.env.APNS_TEAM_ID,
        keyId: process.env.APNS_KEY_ID,
        bundleId: process.env.APNS_BUNDLE_ID,
        privateKeyPath: process.env.APNS_PRIVATE_KEY_PATH,
        environment: readApnsEnvironment(),
    },
    alerts: {
        enabled: process.env.ALERTS_ENABLED !== "false",
        pollIntervalMs: readPositiveInt("ALERTS_POLL_INTERVAL_MS", 900_000),
    },
    rateLimit: {
        enabled: process.env.RATE_LIMIT_ENABLED !== "false",
        windowMs: readPositiveInt("RATE_LIMIT_WINDOW_MS", 60_000),
        ipMax: readPositiveInt("RATE_LIMIT_IP_MAX", 60),
        maxTrackedIps: readPositiveInt("RATE_LIMIT_MAX_TRACKED_IPS", 10_000),
    },
};

function readPositiveInt (key: string, fallback: number): number {
    const raw = process.env[key];

    if (raw === undefined || !raw.trim()) {
        return fallback;
    }

    const value = Number(raw);

    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new InvalidEnvVarError(key, "a positive integer");
    }

    return value;
}

function readApnsEnvironment (): "development" | "production" {
    const raw = process.env.APNS_ENVIRONMENT;

    if (raw === undefined || !raw.trim()) {
        return "development";
    }

    const value = raw.trim().toLowerCase();

    if (value !== "development" && value !== "production") {
        throw new InvalidEnvVarError("APNS_ENVIRONMENT", "'development' or 'production'");
    }

    return value;
}

function readTrustProxy (): boolean | number | string {
    const raw = process.env.HTTP_TRUST_PROXY;

    if (raw === undefined || !raw.trim()) {
        return 1;
    }

    const value = raw.trim();

    if (value === "true" || value === "false") {
        return value === "true";
    }

    const hopCount = Number(value);

    if (Number.isSafeInteger(hopCount) && hopCount >= 0) {
        return hopCount;
    }

    return value;
}
