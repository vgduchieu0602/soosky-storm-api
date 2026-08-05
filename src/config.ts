import dotenv from "dotenv";

export { config as default };

class MissingEnvVarError extends Error {
    public constructor (key: string) {
        super("Environment variable [" + key + "] is required.");
        this.name = "MissingEnvVarError";
    }
}

dotenv.config({ 
    encoding: "utf-8", 
    override: true 
});

const config = {
    http: {
        port: parseInt(process.env.HTTP_PORT || "") || 3000,
        host: process.env.HTTP_HOST || "0.0.0.0",
    },
    mongo: {
        uri: process.env.MONGO_URI,
    },
    nhc: {
        currentStormsUrl: process.env.NHC_CURRENT_STORMS_URL || "https://www.nhc.noaa.gov/CurrentStorms.json",
        aidPublicUrl: process.env.NHC_ATCF_AID_PUBLIC_URL || "https://ftp.nhc.noaa.gov/atcf/aid_public",
        cacheTtlMs: parseInt(process.env.NHC_CACHE_TTL_MS || "7200000"),
    },
    gdacs: {
        geometryUrl: process.env.GDACS_GEOMETRY_URL || "https://www.gdacs.org/gdacsapi/api/polygons/getgeometry",
    },
    openWeather: {
        apiKey: process.env.OPENWEATHER_API_KEY,
    },
    rateLimit: {
        enabled: process.env.RATE_LIMIT_ENABLED !== "false",
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000"),
        globalMax: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || "120"),
        ipMax: parseInt(process.env.RATE_LIMIT_IP_MAX || "60"),
    },
};
