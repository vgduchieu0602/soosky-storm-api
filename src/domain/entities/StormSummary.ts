export { StormSummary as default };
export type { StormCategory, StormSource };

type StormSource = "nhc" | "gdacs";

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
    source: StormSource;
    basin: string | null;
    /** Affected countries/territory from GDACS; NHC areas are derived from the basin at the HTTP boundary. */
    area?: string | null;
    lat: number;
    lon: number;
    datetime: string;
    windSpeed: number | null;
    category: StormCategory;
    /** GDACS publishes Green/Orange/Red; NHC's active-storm feed has no equivalent. */
    alertLevel: string | null;
}
