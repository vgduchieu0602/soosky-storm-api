import DemoStormSummary from "../../entities/DemoStormSummary.js";

export { GetDemoStormsUseCase as default };

const DEMO_STORM_PROFILES = [
    { stormId: "nhc:AL012026", name: "AURORA", basin: "AL", lat: 15.4, lon: -49.8 },
    { stormId: "nhc:AL022026", name: "BANYAN", basin: "AL", lat: 24.1, lon: -68.3 },
    { stormId: "nhc:EP012026", name: "CELESTE", basin: "EP", lat: 13.6, lon: -107.1 },
    { stormId: "nhc:EP022026", name: "DRAGON", basin: "EP", lat: 18.2, lon: -115.4 },
    { stormId: "nhc:CP012026", name: "EMBER", basin: "CP", lat: 14.8, lon: -159.6 },
    { stormId: "nhc:AL032026", name: "FALCON", basin: "AL", lat: 20.6, lon: -57.2 },
    { stormId: "nhc:EP032026", name: "GEMINI", basin: "EP", lat: 11.9, lon: -99.5 },
] as const;

const DEMO_INTENSITIES = [
    { windSpeed: 30, category: "tropical_depression" },
    { windSpeed: 50, category: "tropical_storm" },
    { windSpeed: 75, category: "category_1" },
    { windSpeed: 90, category: "category_2" },
    { windSpeed: 105, category: "category_3" },
    { windSpeed: 125, category: "category_4" },
] as const;

class GetDemoStormsUseCase {
    public constructor (private readonly _random: () => number = Math.random) {}

    public async execute (): Promise<DemoStormSummary[]> {
        const count = this._randomInteger(1, 5);
        const profiles = this._shuffle([...DEMO_STORM_PROFILES]).slice(0, count);

        return profiles.map((profile) => {
            const intensity = DEMO_INTENSITIES[this._randomInteger(0, DEMO_INTENSITIES.length - 1)]!;

            return {
                ...profile,
                lat: this._randomCoordinate(profile.lat),
                lon: this._randomCoordinate(profile.lon),
                datetime: new Date(Date.now() - this._randomInteger(0, 48 * 60 * 60 * 1000)).toISOString(),
                windSpeed: intensity.windSpeed,
                category: intensity.category,
                source: "nhc",
                alertLevel: null,
                isDemo: true,
            };
        });
    }

    private _shuffle<T> (items: T[]): T[] {
        for (let index = items.length - 1; index > 0; index--) {
            const target = this._randomInteger(0, index);
            [items[index], items[target]] = [items[target]!, items[index]!];
        }

        return items;
    }

    private _randomCoordinate (center: number): number {
        return Math.round((center + (this._random() * 4) - 2) * 10) / 10;
    }

    private _randomInteger (minimum: number, maximum: number): number {
        return Math.floor(this._random() * ((maximum - minimum) + 1)) + minimum;
    }
}
