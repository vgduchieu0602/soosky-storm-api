import { HistoricalStormTrackPoint } from "../../domain/entities/HistoricalStormTrack.js";
import { getStormCategoryFromWindSpeed } from "./parseNhcForecastTrackKml.js";

export { parseNhcBestTrackDeck as default };

function parseNhcBestTrackDeck (content: string): HistoricalStormTrackPoint[] {
    const pointsByDatetime = new Map<string, HistoricalStormTrackPoint>();

    for (const line of content.split(/\r?\n/)) {
        const point = parseBestTrackLine(line);

        if (point && !pointsByDatetime.has(point.datetime)) {
            pointsByDatetime.set(point.datetime, point);
        }
    }

    return [...pointsByDatetime.values()].sort((left, right) => {
        return Date.parse(left.datetime) - Date.parse(right.datetime);
    });
}

function parseBestTrackLine (line: string): HistoricalStormTrackPoint | null {
    const fields = line.split(",").map((field) => field.trim());
    const techIndex = fields.findIndex((field) => field.toUpperCase() === "BEST");

    if (techIndex < 0) {
        return null;
    }

    const datetime = parseCycleTime(fields[2]);
    const lat = parseCoordinate(fields[techIndex + 2], "NS");
    const lon = parseCoordinate(fields[techIndex + 3], "EW");

    if (
        !datetime
        || lat === null
        || lon === null
        || lat < -90
        || lat > 90
        || lon < -180
        || lon > 180
    ) {
        return null;
    }

    const windSpeed = parseWindSpeed(fields[techIndex + 4]);

    return {
        lat,
        lon,
        datetime,
        windSpeed,
        category: getStormCategoryFromWindSpeed(windSpeed),
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
    if (value === undefined || !value.trim()) {
        return null;
    }

    const windSpeed = Number(value);

    return Number.isFinite(windSpeed) && windSpeed >= 0 ? windSpeed : null;
}
