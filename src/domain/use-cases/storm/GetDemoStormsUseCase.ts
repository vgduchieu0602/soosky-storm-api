import DemoStormSummary from "../../entities/DemoStormSummary.js";
import StormProviderError from "../../errors/StormProviderError.js";
import HistoricalStormTrackRepository from "../../repositories/IHistoricalStormTrackRepository.js";

export { GetDemoStormsUseCase as default };

const HISTORICAL_DEMO_STORMS = [
    { stormId: "nhc:AL052025", name: "ERIN" },
    { stormId: "nhc:AL092025", name: "IMELDA" },
    { stormId: "nhc:AL132025", name: "MELISSA" },
    { stormId: "nhc:EP012025", name: "ALVIN" },
    { stormId: "nhc:EP052025", name: "ERICK" },
    { stormId: "nhc:CP012025", name: "IONA" },
    { stormId: "nhc:CP022025", name: "KELI" },
] as const;

class GetDemoStormsUseCase {
    public constructor (
        private readonly _historicalStormTrackRepo: HistoricalStormTrackRepository,
        private readonly _random: () => number = Math.random,
    ) {}

    public async execute (): Promise<DemoStormSummary[]> {
        const count = this._randomInteger(1, 5);
        const start = this._randomInteger(0, HISTORICAL_DEMO_STORMS.length - 1);
        const profiles = Array.from({ length: count }, (_value, index) => {
            return HISTORICAL_DEMO_STORMS[(start + index) % HISTORICAL_DEMO_STORMS.length]!;
        });
        const tracks = await Promise.all(profiles.map(async (profile) => {
            return {
                profile,
                track: await this._historicalStormTrackRepo.getHistoricalStormTrack(profile.stormId),
            };
        }));

        return tracks.map(({ profile, track }) => {
            const latest = track.history.at(-1);

            if (track.availability !== "available" || !latest) {
                throw new StormProviderError("NHC historical best track is not available for " + profile.stormId + ".");
            }

            return {
                stormId: profile.stormId,
                name: profile.name,
                source: "nhc",
                basin: profile.stormId.slice(4, 6),
                lat: latest.lat,
                lon: latest.lon,
                datetime: latest.datetime,
                windSpeed: latest.windSpeed,
                category: latest.category,
                alertLevel: null,
                isDemo: true,
            };
        });
    }

    private _randomInteger (minimum: number, maximum: number): number {
        return Math.floor(this._random() * ((maximum - minimum) + 1)) + minimum;
    }
}
