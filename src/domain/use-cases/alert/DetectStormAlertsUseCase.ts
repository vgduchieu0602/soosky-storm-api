import StormAlert, { StormAlertType } from "../../entities/alert/StormAlert.js";
import StormState from "../../entities/alert/StormState.js";
import StormSummary from "../../entities/storm/StormSummary.js";
import { buildStormAlertMessage } from "../../services/alertMessages.js";
import { getBearing, getDistanceKm, toCompassDirection } from "../../services/geo.js";
import { toStormTrackingId } from "../../services/stormIdentity.js";
import ActiveStormsRepository from "../../repositories/storm/IActiveStormsRepository.js";
import StormAlertRepository from "../../repositories/alert/IStormAlertRepository.js";
import StormStateRepository from "../../repositories/alert/IStormStateRepository.js";

export { DetectStormAlertsUseCase as default };
export type { DetectStormAlertsResult };

interface DetectStormAlertsResult {
    stormsSeen: number;
    alerts: StormAlert[];
    saved: number;
    /** Alerts a previous cycle had already recorded before it was interrupted. */
    skippedAsDuplicate: number;
}

/** Everything an alert carries except what is derived from it or from the clock. */
type StormAlertCore = Omit<StormAlert, "id" | "title" | "description" | "createdAt">;

/** Below this the storm has not really moved, so no bearing is derived. */
const MIN_MOVEMENT_KM = 10;

/** A course change smaller than one compass sector is not worth a notification. */
const MIN_BEARING_CHANGE_DEGREES = 45;

/**
 * Finds what changed about the active storms since the last cycle and records it.
 * Delivering those alerts to devices is a separate step: an alert is a fact about a
 * storm, and it must survive whether or not anyone can be notified about it.
 */
class DetectStormAlertsUseCase {
    public constructor (
        private readonly _storms: ActiveStormsRepository,
        private readonly _states: StormStateRepository,
        private readonly _alerts: StormAlertRepository,
        private readonly _now: () => number = Date.now,
    ) {}

    public async execute (): Promise<DetectStormAlertsResult> {
        const [storms, previousStates] = await Promise.all([
            this._storms.getActiveStorms(),
            this._states.listStates(),
        ]);
        const previousById = new Map(previousStates.map((state) => [state.trackingId, state]));
        // One timestamp for the whole cycle, so alerts found together read together.
        const createdAt = new Date(this._now()).toISOString();
        const alerts: StormAlert[] = [];
        const nextStates: StormState[] = [];

        for (const storm of storms) {
            const previous = previousById.get(toStormTrackingId(storm.stormId)) ?? null;

            alerts.push(...detectChanges(storm, previous, createdAt));
            nextStates.push(toStormState(storm, previous));
        }

        const dissipated = previousStates.filter((state) => {
            return !storms.some((storm) => toStormTrackingId(storm.stormId) === state.trackingId);
        });

        alerts.push(...dissipated.map((state) => toDissipatedAlert(state, createdAt)));

        // Alerts are written before the states they were derived from. An interrupted
        // cycle then re-detects the same change, which the alert's own identity turns
        // into a no-op; the other order would lose the alert instead.
        const saved = await this._alerts.saveAlerts(alerts);

        await this._persist(nextStates, dissipated);

        return {
            stormsSeen: storms.length,
            alerts,
            saved,
            skippedAsDuplicate: alerts.length - saved,
        };
    }

    private async _persist (nextStates: StormState[], dissipated: StormState[]): Promise<void> {
        for (const state of nextStates) {
            await this._states.saveState(state);
        }

        for (const state of dissipated) {
            await this._states.removeState(state.trackingId);
        }
    }
}

function detectChanges (storm: StormSummary, previous: StormState | null, createdAt: string): StormAlert[] {
    if (!previous) {
        return [toAlert(storm, "new_storm", null, null, createdAt)];
    }

    const alerts: StormAlert[] = [];

    if (storm.category !== previous.category) {
        alerts.push(toAlert(storm, "category_change", previous.category, storm.category, createdAt));
    }

    if (storm.alertLevel !== null && storm.alertLevel !== previous.alertLevel) {
        alerts.push(toAlert(storm, "alert_level_change", previous.alertLevel, storm.alertLevel, createdAt));
    }

    const watchWarning = storm.watchWarning ?? null;

    if (watchWarning !== null && watchWarning !== previous.watchWarning) {
        alerts.push(toAlert(storm, "watch_warning", previous.watchWarning, watchWarning, createdAt));
    }

    const direction = getMovementDirection(storm, previous);

    if (hasChangedCourse(storm, previous) && direction !== null) {
        alerts.push(toAlert(storm, "track_change", toDirection(previous.bearing), direction, createdAt));
    }

    return alerts;
}

function hasChangedCourse (storm: StormSummary, previous: StormState): boolean {
    if (previous.bearing === null) {
        return false;
    }

    const bearing = getMovementBearing(storm, previous);

    if (bearing === null) {
        return false;
    }

    const delta = Math.abs(bearing - previous.bearing) % 360;

    return Math.min(delta, 360 - delta) >= MIN_BEARING_CHANGE_DEGREES;
}

function getMovementBearing (storm: StormSummary, previous: StormState | null): number | null {
    if (!previous || getDistanceKm(previous, storm) < MIN_MOVEMENT_KM) {
        return null;
    }

    return getBearing(previous, storm);
}

function getMovementDirection (storm: StormSummary, previous: StormState | null): string | null {
    return toDirection(getMovementBearing(storm, previous));
}

function toDirection (bearing: number | null): string | null {
    return bearing === null ? null : toCompassDirection(bearing);
}

function toStormState (storm: StormSummary, previous: StormState | null): StormState {
    return {
        trackingId: toStormTrackingId(storm.stormId),
        stormId: storm.stormId,
        name: storm.name,
        lat: storm.lat,
        lon: storm.lon,
        windSpeed: storm.windSpeed,
        category: storm.category,
        alertLevel: storm.alertLevel,
        watchWarning: storm.watchWarning ?? null,
        bearing: getMovementBearing(storm, previous) ?? previous?.bearing ?? null,
        datetime: storm.datetime,
    };
}

function toAlert (
    storm: StormSummary,
    type: StormAlertType,
    previousValue: string | null,
    currentValue: string | null,
    createdAt: string,
): StormAlert {
    return toStormAlert({
        type,
        trackingId: toStormTrackingId(storm.stormId),
        stormId: storm.stormId,
        stormName: storm.name,
        previousValue,
        currentValue,
        lat: storm.lat,
        lon: storm.lon,
        windSpeed: storm.windSpeed,
        category: storm.category,
        observedAt: storm.datetime,
    }, createdAt);
}

function toDissipatedAlert (state: StormState, createdAt: string): StormAlert {
    return toStormAlert({
        type: "storm_dissipated",
        trackingId: state.trackingId,
        stormId: state.stormId,
        stormName: state.name,
        previousValue: null,
        currentValue: null,
        lat: state.lat,
        lon: state.lon,
        windSpeed: state.windSpeed,
        category: state.category,
        // The storm is gone from the source, so its last observation is what dates this.
        observedAt: state.datetime ?? "",
    }, createdAt);
}

function toStormAlert (core: StormAlertCore, createdAt: string): StormAlert {
    // The stored wording belongs to the storm, so it carries no distance: only a push
    // to a specific device can know how far away that device is.
    const message = buildStormAlertMessage(core, null);

    return { id: toAlertId(core), ...core, ...message, createdAt };
}

/**
 * The same observation plus the same kind of change is the same alert, however many
 * times a cycle re-runs. Keyed on the episode-free identity so a GDACS episode bump
 * is not a new alert.
 */
function toAlertId (core: StormAlertCore): string {
    return core.trackingId + "|" + core.type + "|" + (core.currentValue ?? "") + "|" + core.observedAt;
}
