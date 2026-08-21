import MapTile, { MapLayer, MapTileQuery } from "../../domain/entities/map/MapTile.js";
import StormProviderError from "../../domain/errors/StormProviderError.js";
import MapTileRepository from "../../domain/repositories/map/IMapTileRepository.js";

const OPENWEATHER_TILE_URL = "https://tile.openweathermap.org/map";
const PROVIDER_LAYERS: Record<MapLayer, string> = {
    windSpeed: "wind_new",
    temperature: "temp_new",
    pressure: "pressure_new",
    precipitation: "precipitation_new",
};

export { OpenWeatherMapTileRepository as default };

class OpenWeatherMapTileRepository implements MapTileRepository {
    public constructor (
        private readonly _apiKey: string | undefined,
        private readonly _fetcher: typeof fetch = fetch,
    ) {}

    public async getTile (query: MapTileQuery): Promise<MapTile> {
        if (!this._apiKey?.trim()) {
            throw new StormProviderError("OPENWEATHER_API_KEY is required.");
        }

        const url = new URL(
            OPENWEATHER_TILE_URL + "/" + PROVIDER_LAYERS[query.layer] + "/" + query.z + "/" + query.x + "/" + query.y + ".png",
        );
        url.searchParams.set("appid", this._apiKey);

        let response: Response;

        try {
            response = await this._fetcher(url, {
                headers: {
                    Accept: "image/png",
                    "User-Agent": "soosky-storm-api/1.0",
                },
                signal: AbortSignal.timeout(10_000),
            });
        } catch (error) {
            throw new StormProviderError("OpenWeather map tile request could not be completed.", { cause: error });
        }

        if (!response.ok) {
            throw new StormProviderError("OpenWeather map tile request failed with HTTP " + response.status + ".");
        }

        return {
            buffer: Buffer.from(await response.arrayBuffer()),
            contentType: response.headers.get("content-type") ?? "image/png",
        };
    }
}
