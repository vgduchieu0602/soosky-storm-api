export { StormSummary as default };
export type { StormCategory, StormSource };

type StormSource = "nhc" | "gdacs";

type StormCategory =
    | "category_1"
    | "category_2"
    | "category_3"
    | "category_4"
    | "category_5";

interface StormSummary {
    stormId: string;
    name: string;
    source: StormSource;
    basin: string | null;
    area?: string | null;
    lat: number;
    lon: number;
    datetime: string;
    windSpeed: number | null;
    category: StormCategory | null;
    alertLevel: string | null;
    watchWarning?: string | null;
}
