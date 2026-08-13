export { getStormArea as default };
export type { StormArea };

type StormArea = "PO" | "AO" | "IO" | "SO" | "AR";

interface StormAreaInput {
    stormId: string;
    lat: number;
    lon: number;
}

function getStormArea ({ stormId, lat, lon }: StormAreaInput): StormArea {
    switch (stormId.slice(4, 6)) {
        case "AL": return "AO";
        case "EP":
        case "CP": return "PO";
        default: return getAreaFromPosition(lat, lon);
    }
}

function getAreaFromPosition (lat: number, lon: number): StormArea {
    if (lat >= 66) {
        return "AR";
    }

    if (lat <= -60) {
        return "SO";
    }

    if (lon >= 20 && lon < 100) {
        return "IO";
    }

    if (lon >= -100 && lon < 20) {
        return "AO";
    }

    return "PO";
}
