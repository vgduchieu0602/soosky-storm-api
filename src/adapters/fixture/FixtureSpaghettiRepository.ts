import StormSpaghetti, { StormSpaghettiModel } from "../../domain/entities/StormSpaghetti.js";
import SpaghettiRepository from "../../domain/repositories/ISpaghettiRepository.js";
import { FIXTURE_ACTIVE_STORMS } from "./FixtureStormRepository.js";

export { FixtureSpaghettiRepository as default };

const NOT_SUPPORTED_REASON = "Spaghetti models are published for NHC storms only.";
const NOT_AVAILABLE_REASON = "No spaghetti model data is published for this storm.";
const FORECAST_HOURS = [12, 24, 36, 48, 72];

/** Each model leaves the storm centre on its own heading so the tracks fan out. */
const MODELS: readonly { code: string; label: string; latPerDay: number; lonPerDay: number }[] = [
    { code: "AVNO", label: "GFS", latPerDay: 2.1, lonPerDay: -3.4 },
    { code: "AEMN", label: "GEFS Mean", latPerDay: 1.6, lonPerDay: -3.9 },
    { code: "NVGM", label: "NAVGEM", latPerDay: 2.8, lonPerDay: -2.7 },
];

/**
 * Spaghetti tracks derived from the fixture storm centres, so a storm listed by
 * {@link FixtureStormRepository} always has models to draw on the same map.
 */
class FixtureSpaghettiRepository implements SpaghettiRepository {
    public async getStormSpaghetti (stormId: string): Promise<StormSpaghetti> {
        if (!stormId.startsWith("nhc:")) {
            return toEmptySpaghetti(stormId, "not_supported", NOT_SUPPORTED_REASON);
        }

        const storm = FIXTURE_ACTIVE_STORMS.find((candidate) => candidate.stormId === stormId);

        if (!storm) {
            return toEmptySpaghetti(stormId, "not_available", NOT_AVAILABLE_REASON);
        }

        return {
            stormId,
            source: "nhc-atcf",
            cycleTime: storm.datetime,
            cachedUntil: null,
            availability: "available",
            models: MODELS.map((model) => toModel(model, storm.lat, storm.lon, storm.windSpeed ?? 45)),
        };
    }
}

function toModel (
    model: (typeof MODELS)[number],
    lat: number,
    lon: number,
    windSpeed: number,
): StormSpaghettiModel {
    return {
        code: model.code,
        label: model.label,
        points: FORECAST_HOURS.map((forecastHour) => {
            const days = forecastHour / 24;

            return {
                forecastHour,
                lat: round(lat + (model.latPerDay * days)),
                lon: round(lon + (model.lonPerDay * days)),
                windSpeed: Math.max(30, Math.round(windSpeed - (forecastHour / 4))),
            };
        }),
    };
}

function toEmptySpaghetti (
    stormId: string,
    availability: StormSpaghetti["availability"],
    reason: string,
): StormSpaghetti {
    return {
        stormId,
        source: "nhc-atcf",
        cycleTime: null,
        cachedUntil: null,
        availability,
        reason,
        models: [],
    };
}

function round (value: number): number {
    return Math.round(value * 10) / 10;
}
