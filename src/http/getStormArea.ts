export { getStormArea as default };
export type { StormArea };

type StormArea = "PO" | "AO" | "IO";

interface StormAreaInput {
    stormId: string;
    lat: number;
    lon: number;
}

function getStormArea ({ stormId, lon }: StormAreaInput): StormArea {
    switch (stormId.slice(4, 6)) {
        case "AL": return "AO";
        case "EP":
        case "CP": return "PO";
        default: return getAreaFromPosition(lon);
    }
}

function getAreaFromPosition (lon: number): StormArea {
    if (lon >= 20 && lon < 100) {
        return "IO";
    }

    if (lon >= -100 && lon < 20) {
        return "AO";
    }

    return "PO";
}
