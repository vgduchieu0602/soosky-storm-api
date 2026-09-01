import CachedCurrentWeatherRepository from "../adapters/cache/CachedCurrentWeatherRepository.js";
import CachedForecastWeatherRepository from "../adapters/cache/CachedForecastWeatherRepository.js";
import CachedMapTileRepository from "../adapters/cache/CachedMapTileRepository.js";
import CachedRadarRepository from "../adapters/cache/CachedRadarRepository.js";
import FixtureWeatherRepository from "../adapters/fixture/FixtureWeatherRepository.js";
import OpenWeatherCurrentWeatherRepository from "../adapters/openweather/OpenWeatherCurrentWeatherRepository.js";
import OpenWeatherForecastRepository from "../adapters/openweather/OpenWeatherForecastRepository.js";
import OpenWeatherMapTileRepository from "../adapters/openweather/OpenWeatherMapTileRepository.js";
import RainViewerRadarRepository from "../adapters/rainviewer/RainViewerRadarRepository.js";
import type { AppConfig } from "../config.js";

export { createWeatherDependencies as default };
export type { WeatherDependencies };

type WeatherDependencies = ReturnType<typeof createWeatherDependencies>;

/**
 * Weather and map-layer sources.
 *
 * Map tiles and radar stay on their live providers in fixture mode: they are
 * position-independent imagery, so there is nothing deterministic to substitute.
 */
function createWeatherDependencies (config: AppConfig, isFixtureMode: boolean) {
    const { cache, openWeather } = config;
    const fixtureWeatherRepository = isFixtureMode ? new FixtureWeatherRepository() : null;

    return {
        forecastWeatherRepository: new CachedForecastWeatherRepository(
            fixtureWeatherRepository ?? new OpenWeatherForecastRepository(openWeather.apiKey),
            cache.forecastWeatherTtlMs,
        ),
        currentWeatherRepository: new CachedCurrentWeatherRepository(
            fixtureWeatherRepository ?? new OpenWeatherCurrentWeatherRepository(openWeather.apiKey),
            cache.currentWeatherTtlMs,
        ),
        mapTileRepository: new CachedMapTileRepository(
            new OpenWeatherMapTileRepository(openWeather.apiKey),
            cache.mapTileTtlMs,
        ),
        radarRepository: new CachedRadarRepository(
            new RainViewerRadarRepository(),
            cache.radarTtlMs,
        ),
    };
}
