import {
    StormSpaghettiModel,
    StormSpaghettiPoint,
} from "../../domain/entities/storm/StormSpaghetti.js";

export { parseNhcAidDeck as default };
export type { ParsedNhcAidDeck };

const MODEL_LABELS: Readonly<Partial<Record<string, string>>> = {
    AVNO: "GFS",
    AEMN: "GEFS Mean",
    EMXI: "ECMWF",
    EGRR: "UKMET",
    NVGM: "NAVGEM",
};

interface ParsedAidDeckRecord {
    cycleTime: string;
    code: string;
    forecastHour: number;
    lat: number;
    lon: number;
    windSpeed: number | null;
}

interface ParsedNhcAidDeck {
    cycleTime: string;
    models: StormSpaghettiModel[];
}

function parseNhcAidDeck (content: string): ParsedNhcAidDeck | null {
    const records = content
        .split(/\r?\n/)
        .map((line) => parseAidDeckLine(line))
        .filter((record): record is ParsedAidDeckRecord => record !== null)
        .filter((record) => MODEL_LABELS[record.code] !== undefined);
    const cycleTime = records
        .map((record) => record.cycleTime)
        .sort()
        .at(-1);

    if (!cycleTime) {
        return null;
    }

    const models = toModels(records.filter((record) => record.cycleTime === cycleTime));

    return models.length ? { cycleTime, models } : null;
}

function parseAidDeckLine (line: string): ParsedAidDeckRecord | null {
    const fields = line.split(",").map((field) => field.trim());
    const cycleTime = parseCycleTime(fields[2]);
    const code = fields[4]?.toUpperCase();
    const forecastHour = parseForecastHour(fields[5]);
    const lat = parseCoordinate(fields[6], "NS");
    const lon = parseCoordinate(fields[7], "EW");

    if (
        !cycleTime
        || !code
        || forecastHour === null
        || lat === null
        || lon === null
        || lat < -90
        || lat > 90
        || lon < -180
        || lon > 180
    ) {
        return null;
    }

    return {
        cycleTime,
        code,
        forecastHour,
        lat,
        lon,
        windSpeed: parseWindSpeed(fields[8]),
    };
}

function parseCycleTime (value: string | undefined): string | null {
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(value ?? "");

    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const date = new Date(Date.UTC(year, month - 1, day, hour));

    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
        || date.getUTCHours() !== hour
    ) {
        return null;
    }

    return date.toISOString();
}

function parseForecastHour (value: string | undefined): number | null {
    const hour = Number(value);

    return Number.isInteger(hour) && hour >= 0 ? hour : null;
}

function parseCoordinate (value: string | undefined, hemispheres: string): number | null {
    const match = /^(\d+)([NSEW])$/i.exec(value ?? "");
    const magnitudeText = match?.[1];
    const hemisphereText = match?.[2];

    if (!magnitudeText || !hemisphereText || !hemispheres.includes(hemisphereText.toUpperCase())) {
        return null;
    }

    const magnitude = Number(magnitudeText) / 10;
    const hemisphere = hemisphereText.toUpperCase();
    const sign = hemisphere === "S" || hemisphere === "W" ? -1 : 1;

    return Number.isFinite(magnitude) ? magnitude * sign : null;
}

function parseWindSpeed (value: string | undefined): number | null {
    const windSpeed = Number(value);

    return Number.isFinite(windSpeed) ? windSpeed : null;
}

function toModels (records: ParsedAidDeckRecord[]): StormSpaghettiModel[] {
    const models = new Map<string, Map<number, StormSpaghettiPoint>>();

    for (const record of records) {
        const points = models.get(record.code) ?? new Map<number, StormSpaghettiPoint>();

        if (!points.has(record.forecastHour)) {
            points.set(record.forecastHour, {
                forecastHour: record.forecastHour,
                lat: record.lat,
                lon: record.lon,
                windSpeed: record.windSpeed,
            });
        }

        models.set(record.code, points);
    }

    return [...models.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, points]) => {
            return {
                code,
                label: MODEL_LABELS[code] ?? code,
                points: [...points.values()].sort((left, right) => {
                    return left.forecastHour - right.forecastHour;
                }),
            };
        });
}
