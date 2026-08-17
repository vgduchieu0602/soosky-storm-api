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
    /** Affected countries/territory from GDACS; NHC areas are derived from the basin at the HTTP boundary. */
    area?: string | null;
    lat: number;
    lon: number;
    datetime: string;
    windSpeed: number | null;
    category: StormCategory | null;
    /** GDACS publishes Green/Orange/Red; NHC's active-storm feed has no equivalent. */
    alertLevel: string | null;
    /** NHC's current storm-surge watch/warning advisory, when published. */
    watchWarning?: string | null;
}
