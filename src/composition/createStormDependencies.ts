import CachedHistoricalStormTrackRepository from "../adapters/cache/CachedHistoricalStormTrackRepository.js";
import CachedSpaghettiRepository from "../adapters/cache/CachedSpaghettiRepository.js";
import CachedStormRepository from "../adapters/cache/CachedStormRepository.js";
import FixtureSpaghettiRepository from "../adapters/fixture/FixtureSpaghettiRepository.js";
import FixtureStormRepository from "../adapters/fixture/FixtureStormRepository.js";
import GdacsStormConeRepository from "../adapters/gdacs/GdacsStormConeRepository.js";
import GdacsStormRepository from "../adapters/gdacs/GdacsStormRepository.js";
import NhcHistoricalStormTrackRepository from "../adapters/nhc/NhcHistoricalStormTrackRepository.js";
import NhcSpaghettiRepository from "../adapters/nhc/NhcSpaghettiRepository.js";
import NhcStormRepository from "../adapters/nhc/NhcStormRepository.js";
import CompositeHistoricalStormTrackRepository from "../adapters/storm/CompositeHistoricalStormTrackRepository.js";
import CompositeStormRepository from "../adapters/storm/CompositeStormRepository.js";
import type { AppConfig } from "../config.js";

export { createStormDependencies as default };
export type { StormDependencies };

type StormDependencies = ReturnType<typeof createStormDependencies>;

/**
 * Storm data sources and their caches.
 *
 * Fixture mode is decided here, once. Production keeps using the providers by
 * default; staging and tester builds serve deterministic local data without
 * depending on an active storm or an upstream service.
 */
function createStormDependencies (config: AppConfig) {
    const { nhc, gdacs, cache } = config;
    const fixtureStormRepository = config.stormDataMode === "fixture"
        ? new FixtureStormRepository()
        : null;
    // Shared by the active-storm composite and the historical-track composite.
    const gdacsStormRepository = new GdacsStormRepository(
        gdacs.eventListUrl,
        gdacs.eventDataUrl,
        gdacs.geometryUrl,
    );
    const sourceStormRepository = fixtureStormRepository ?? new CompositeStormRepository(
        new NhcStormRepository(nhc.currentStormsUrl),
        new GdacsStormConeRepository(gdacs.geometryUrl),
        gdacsStormRepository,
    );

    return {
        isFixtureMode: fixtureStormRepository !== null,
        // Uncached: alert detection reads this so detection latency is not bounded
        // by the storm-list cache the HTTP endpoints use.
        sourceStormRepository,
        stormRepository: new CachedStormRepository(
            sourceStormRepository,
            cache.stormTtlMs,
            cache.activeStormsTtlMs,
        ),
        spaghettiRepository: new CachedSpaghettiRepository(
            fixtureStormRepository
                ? new FixtureSpaghettiRepository()
                : new NhcSpaghettiRepository(nhc.aidPublicUrl),
            cache.stormTtlMs,
        ),
        historicalStormTrackRepository: new CachedHistoricalStormTrackRepository(
            fixtureStormRepository ?? new CompositeHistoricalStormTrackRepository(
                new NhcHistoricalStormTrackRepository(nhc.currentStormsUrl, fetch, nhc.archiveUrl),
                gdacsStormRepository,
            ),
            cache.historicalStormTrackTtlMs,
        ),
    };
}
