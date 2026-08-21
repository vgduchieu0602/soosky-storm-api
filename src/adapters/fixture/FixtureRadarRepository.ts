import Radar from "../../domain/entities/radar/Radar.js";
import RadarRepository from "../../domain/repositories/radar/IRadarRepository.js";

export { FixtureRadarRepository as default };

const GENERATED_AT = "2026-08-08T12:00:00.000Z";

/** A stable radar manifest whose tile template stays inside this API. */
class FixtureRadarRepository implements RadarRepository {
    public async getRadar (): Promise<Radar> {
        return {
            source: "fixture",
            attribution: "Synthetic radar data for testing",
            attributionUrl: "https://soosky.local/fixture-radar",
            host: "",
            tileTemplate: "/v1/map-tiles/precipitation/{z}/{x}/{y}",
            past: [
                { time: "2026-08-08T11:40:00.000Z", path: "/fixture/radar/202608081140" },
                { time: "2026-08-08T11:50:00.000Z", path: "/fixture/radar/202608081150" },
                { time: "2026-08-08T12:00:00.000Z", path: "/fixture/radar/202608081200" },
            ],
            nowcast: [
                { time: "2026-08-08T12:10:00.000Z", path: "/fixture/radar/202608081210" },
                { time: "2026-08-08T12:20:00.000Z", path: "/fixture/radar/202608081220" },
            ],
            generatedAt: GENERATED_AT,
            cachedUntil: null,
        };
    }
}
