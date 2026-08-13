import TrackedStorm from "../../entities/TrackedStorm.js";
import StormNotFoundError from "../../errors/StormNotFoundError.js";
import { getCacheStatus, markCacheStatus } from "../../cacheStatus.js";
import ActiveStormsRepository from "../../repositories/IActiveStormsRepository.js";
import HistoricalStormTrackRepository from "../../repositories/IHistoricalStormTrackRepository.js";
import { toStormTrackingId } from "../../stormIdentity.js";

export { GetTrackedStormsUseCase as default };
export type { GetTrackedStormsQuery };

interface GetTrackedStormsQuery {
    stormIds: string[];
}

class GetTrackedStormsUseCase {
    public constructor (
        private readonly _activeStorms: ActiveStormsRepository,
        private readonly _historicalStormTracks: HistoricalStormTrackRepository,
    ) {}

    public async execute (query: GetTrackedStormsQuery): Promise<TrackedStorm[]> {
        const activeStorms = await this._activeStorms.getActiveStorms();
        const activeByTrackingId = new Map(activeStorms.map((storm) => [toStormTrackingId(storm.stormId), storm]));
        const resolved = await Promise.all(query.stormIds.map(async (requestedStormId) => {
            const active = activeByTrackingId.get(toStormTrackingId(requestedStormId));

            if (active) {
                return {
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
            }

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
                    status: "dissipated" as const,
                    category: latest.category,
                    lat: latest.lat,
                    lon: latest.lon,
                    updatedAt: latest.datetime,
                    endedAt: latest.datetime,
                },
                source: history,
            };
        }));
        const sources = [activeStorms, ...resolved.flatMap(({ source }) => source ? [source] : [])];
        const cacheStatus = sources.every((source) => getCacheStatus(source) === "cached")
            ? "cached"
            : sources.some((source) => getCacheStatus(source) === "upstream") ? "upstream" : null;
        const cards = resolved.map(({ card }) => card);

        return cacheStatus === null ? cards : markCacheStatus(cards, cacheStatus);
    }
}
