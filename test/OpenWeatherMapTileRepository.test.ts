import assert from "node:assert/strict";
import test from "node:test";
import OpenWeatherMapTileRepository from "../src/adapters/openweather/OpenWeatherMapTileRepository.js";
import StormProviderError from "../src/domain/errors/StormProviderError.js";
import { MapLayer } from "../src/domain/entities/MapTile.js";

test("OpenWeather map tile repository maps public layers to upstream PNG tiles", async () => {
    const requests: URL[] = [];
    const repository = new OpenWeatherMapTileRepository("secret-key", async (input) => {
        requests.push(new URL(String(input)));
        return new Response(Buffer.from("png"), { headers: { "Content-Type": "image/png" } });
    });

    const cases: Array<{ layer: MapLayer; providerLayer: string }> = [
        { layer: "windSpeed", providerLayer: "wind_new" },
        { layer: "temperature", providerLayer: "temp_new" },
        { layer: "precipitation", providerLayer: "precipitation_new" },
    ];

    for (const { layer, providerLayer } of cases) {
        const tile = await repository.getTile({ layer, z: 3, x: 6, y: 3 });

        assert.deepEqual(tile, { buffer: Buffer.from("png"), contentType: "image/png" });
        assert.equal(requests.at(-1)?.pathname, "/map/" + providerLayer + "/3/6/3.png");
        assert.equal(requests.at(-1)?.searchParams.get("appid"), "secret-key");
    }
});

test("OpenWeather map tile repository rejects a missing API key", async () => {
    const repository = new OpenWeatherMapTileRepository(undefined);

    await assert.rejects(repository.getTile({ layer: "windSpeed", z: 3, x: 6, y: 3 }), StormProviderError);
});

test("OpenWeather map tile repository maps HTTP and network failures to provider errors", async () => {
    const httpFailure = new OpenWeatherMapTileRepository("secret-key", async () => new Response(null, { status: 401 }));
    const networkFailure = new OpenWeatherMapTileRepository("secret-key", async () => Promise.reject(new Error("offline")));

    await assert.rejects(httpFailure.getTile({ layer: "windSpeed", z: 3, x: 6, y: 3 }), StormProviderError);
    await assert.rejects(networkFailure.getTile({ layer: "windSpeed", z: 3, x: 6, y: 3 }), StormProviderError);
});
