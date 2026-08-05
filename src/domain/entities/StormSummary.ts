export { StormSummary as default };
export type { StormCategory };

type StormCategory =
    | "tropical_depression"
    | "tropical_storm"
    | "category_1"
    | "category_2"
    | "category_3"
    | "category_4"
    | "category_5"
    | "unknown";

interface StormSummary {
    stormId: string;
    name: string;
    source: "nhc";
    basin: string;
    lat: number;
    lon: number;
    datetime: string;
    windSpeed: number | null;
    category: StormCategory;
}
