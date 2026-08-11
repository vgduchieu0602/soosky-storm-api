import DemoStormSummary from "../../entities/DemoStormSummary.js";

export { GetDemoStormsUseCase as default };

const DEMO_STORMS: readonly DemoStormSummary[] = [
    {
        stormId: "nhc:AL052025",
        name: "ERIN",
        source: "nhc",
        basin: "AL",
        lat: 18.8,
        lon: -57.6,
        datetime: "2025-08-15T12:00:00.000Z",
        windSpeed: 90,
        category: "category_2",
        alertLevel: null,
        isDemo: true,
    },
    {
        stormId: "nhc:AL092025",
        name: "IMELDA",
        source: "nhc",
        basin: "AL",
        lat: 25.1,
        lon: -71.2,
        datetime: "2025-09-30T12:00:00.000Z",
        windSpeed: 55,
        category: "tropical_storm",
        alertLevel: null,
        isDemo: true,
    },
    {
        stormId: "nhc:EP032025",
        name: "ERICK",
        source: "nhc",
        basin: "EP",
        lat: 14.2,
        lon: -101.4,
        datetime: "2025-06-19T18:00:00.000Z",
        windSpeed: 110,
        category: "category_3",
        alertLevel: null,
        isDemo: true,
    },
];

class GetDemoStormsUseCase {
    public async execute (): Promise<DemoStormSummary[]> {
        return DEMO_STORMS.map((storm) => ({ ...storm }));
    }
}
