import TrackedStorm, { TrackedStormResult } from "../../../domain/entities/storm/TrackedStorm.js";
import HistoricalStormTrack from "../../../domain/entities/storm/HistoricalStormTrack.js";
import StormNotFoundError from "../../../domain/errors/StormNotFoundError.js";
import StormProviderError from "../../../domain/errors/StormProviderError.js";
import { getCacheStatus, markCacheStatus } from "../../../domain/services/cacheStatus.js";
import ActiveStormsRepository from "../../../domain/repositories/storm/IActiveStormsRepository.js";
import HistoricalStormTrackRepository from "../../../domain/repositories/storm/IHistoricalStormTrackRepository.js";
import { toStormTrackingId } from "../../../domain/services/stormIdentity.js";
import { mapWithConcurrency } from "../../services/mapWithConcurrency.js";

export { GetTrackedStormsUseCase as default };
export type { GetTrackedStormsQuery };

const MAX_HISTORICAL_LOOKUP_CONCURRENCY = 5;

interface GetTrackedStormsQuery {
    stormIds: string[];
}

interface ResolvedStorm {
    card: TrackedStormResult;
    source: HistoricalStormTrack | null;
}

class GetTrackedStormsUseCase {
    public constructor (
        private readonly _activeStorms: ActiveStormsRepository,
        private readonly _historicalStormTracks: HistoricalStormTrackRepository,
    ) {}

    public async execute (query: GetTrackedStormsQuery): Promise<TrackedStormResult[]> {
        const activeStorms = await this._activeStorms.getActiveStorms();
        const activeByTrackingId = new Map(activeStorms.map((storm) => [toStormTrackingId(storm.stormId), storm]));
        const resolved: ResolvedStorm[] = new Array(query.stormIds.length);
        const historicalLookups: { index: number; requestedStormId: string }[] = [];

        for (const [index, requestedStormId] of query.stormIds.entries()) {
            const active = activeByTrackingId.get(toStormTrackingId(requestedStormId));

            if (active) {
                resolved[index] = {
                    card: {
                        requestedStormId,
                        trackingId: toStormTrackingId(active.stormId),
                        stormId: active.stormId,
                        name: active.name,
                        source: active.source,
                        area: active.area ?? null,
                        status: "active" as const,
                        category: active.category,
                        lat: active.lat,
                        lon: active.lon,
                        updatedAt: active.datetime,
                        endedAt: null,
                    },
                    source: null,
                };
                continue;
            }

            historicalLookups.push({ index, requestedStormId });
        }

        const historicalResolved = await mapWithConcurrency(
            historicalLookups,
            MAX_HISTORICAL_LOOKUP_CONCURRENCY,
            async ({ index, requestedStormId }) => ({
                index,
                resolved: await this._resolveHistoricalStorm(requestedStormId),
            }),
        );

        for (const { index, resolved: historical } of historicalResolved) {
            resolved[index] = historical;
        }

        const sources = [activeStorms, ...resolved.flatMap(({ source }) => source ? [source] : [])];
        const cacheStatus = sources.every((source) => getCacheStatus(source) === "cached")
            ? "cached"
            : sources.some((source) => getCacheStatus(source) === "upstream") ? "upstream" : null;
        const cards = resolved.map(({ card }) => card);

        return cacheStatus === null ? cards : markCacheStatus(cards, cacheStatus);
    }

    private async _resolveHistoricalStorm (requestedStormId: string): Promise<ResolvedStorm> {
        try {
            const history = await this._historicalStormTracks.getHistoricalStormTrack(requestedStormId);
            const latest = history.history.at(-1);

            if (history.availability !== "available" || !latest) {
                throw new StormNotFoundError(requestedStormId);
            }

            return {
                card: {
                    requestedStormId,
                    trackingId: toStormTrackingId(requestedStormId),
                    stormId: requestedStormId,
                    name: history.name,
                    source: history.source,
                    area: null,
                    status: "dissipated",
                    category: latest.category,
                    lat: latest.lat,
                    lon: latest.lon,
                    updatedAt: latest.datetime,
                    endedAt: latest.datetime,
                },
                source: history,
            };
        } catch (error) {
            if (error instanceof StormNotFoundError) {
                return {
                    card: { requestedStormId, status: "not_found" },
                    source: null,
                };
            }

            if (error instanceof StormProviderError) {
                return {
                    card: { requestedStormId, status: "unavailable" },
                    source: null,
                };
            }

            throw error;
        }
    }
}
