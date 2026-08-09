import RegionSubscription from "../../entities/RegionSubscription.js";
import StormAlert from "../../entities/StormAlert.js";
import StormState from "../../entities/StormState.js";
import StormSummary from "../../entities/StormSummary.js";
import { buildStormAlertMessage } from "../../alertMessages.js";
import { getBearing, getDistanceKm, toCompassDirection } from "../../geo.js";
import { toStormTrackingId } from "../../stormIdentity.js";
import ActiveStormsRepository from "../../repositories/IActiveStormsRepository.js";
import AlertDeliveryRepository from "../../repositories/IAlertDeliveryRepository.js";
import RegionSubscriptionRepository from "../../repositories/IRegionSubscriptionRepository.js";
import StormStateRepository from "../../repositories/IStormStateRepository.js";
import StormSubscriptionRepository from "../../repositories/IStormSubscriptionRepository.js";
import SendPushNotificationUseCase from "../notification/SendPushNotificationUseCase.js";

export { DetectStormAlertsUseCase as default };
export type { DetectStormAlertsResult };

interface DetectStormAlertsResult {
    stormsSeen: number;
    alerts: StormAlert[];
    sent: number;
    skippedAsDuplicate: number;
    failed: number;
}

/** Below this the storm has not really moved, so no bearing is derived. */
const MIN_MOVEMENT_KM = 10;

/** A course change smaller than one compass sector is not worth a notification. */
const MIN_BEARING_CHANGE_DEGREES = 45;

class DetectStormAlertsUseCase {
    public constructor (
        private readonly _storms: ActiveStormsRepository,
        private readonly _states: StormStateRepository,
        private readonly _stormSubscriptions: StormSubscriptionRepository,
        private readonly _regionSubscriptions: RegionSubscriptionRepository,
        private readonly _deliveries: AlertDeliveryRepository,
        private readonly _sendPushNotification: SendPushNotificationUseCase,
        private readonly _logError: (message: string) => void = (message) => console.error(message),
    ) {}

    public async execute (): Promise<DetectStormAlertsResult> {
        const [storms, previousStates] = await Promise.all([
            this._storms.getActiveStorms(),
            this._states.listStates(),
        ]);
        const previousById = new Map(previousStates.map((state) => [state.trackingId, state]));
        const alerts: StormAlert[] = [];
        const nextStates: StormState[] = [];

        for (const storm of storms) {
            const previous = previousById.get(toStormTrackingId(storm.stormId)) ?? null;

            alerts.push(...detectChanges(storm, previous));
            nextStates.push(toStormState(storm, previous));
        }

        const dissipated = previousStates.filter((state) => {
            return !storms.some((storm) => toStormTrackingId(storm.stormId) === state.trackingId);
        });

        alerts.push(...dissipated.map(toDissipatedAlert));

        const regions = alerts.length ? await this._regionSubscriptions.listRegions() : [];
        let sent = 0;
        let skippedAsDuplicate = 0;
        let failed = 0;

        for (const alert of alerts) {
            const outcome = await this._deliver(alert, regions);

            sent += outcome.sent;
            skippedAsDuplicate += outcome.skippedAsDuplicate;
            failed += outcome.failed;
        }

        await this._persist(nextStates, dissipated);

        return {
            stormsSeen: storms.length,
            alerts,
            sent,
            skippedAsDuplicate,
            failed,
        };
    }

    private async _deliver (alert: StormAlert, regions: RegionSubscription[]) {
        const followers = await this._stormSubscriptions.listDeviceTokensForStorm(alert.trackingId);
        const regionsByToken = new Map(regions.map((region) => [region.deviceToken, region]));
        const nearby = regions.filter((region) => {
            return getDistanceKm(region, alert) <= region.radiusKm;
        });
        // A follower hears about their storm at any distance; a region subscriber
        // only when the storm is inside the radius they saved.
        const recipients = new Set([...followers, ...nearby.map((region) => region.deviceToken)]);
        let sent = 0;
        let skippedAsDuplicate = 0;
        let failed = 0;

        for (const deviceToken of recipients) {
            const region = regionsByToken.get(deviceToken) ?? null;
            const distanceKm = region ? getDistanceKm(region, alert) : null;
            const message = buildStormAlertMessage(alert, distanceKm);

            try {
                if (!await this._deliveries.claimDelivery(deviceToken, toAlertKey(alert))) {
                    skippedAsDuplicate += 1;
                    continue;
                }

                await this._sendPushNotification.execute({
                    deviceToken,
                    title: message.title,
                    description: message.description,
                });
                sent += 1;
            } catch (error) {
                // One undeliverable device must not stop the rest of the cycle.
                failed += 1;
                this._logError("Storm alert delivery failed: " + toErrorMessage(error));
            }
        }

        return { sent, skippedAsDuplicate, failed };
    }

    private async _persist (nextStates: StormState[], dissipated: StormState[]): Promise<void> {
        for (const state of nextStates) {
            await this._states.saveState(state);
        }

        for (const state of dissipated) {
            await this._states.removeState(state.trackingId);
            await this._deliveries.removeDeliveries(state.trackingId);
        }
    }
}

function detectChanges (storm: StormSummary, previous: StormState | null): StormAlert[] {
    if (!previous) {
        return [toAlert(storm, "new_storm", "", getMovementDirection(storm, null))];
    }

    const alerts: StormAlert[] = [];
    const direction = getMovementDirection(storm, previous);

    if (storm.category !== previous.category) {
        alerts.push(toAlert(storm, "category_change", storm.category, direction));
    }

    if (storm.alertLevel !== null && storm.alertLevel !== previous.alertLevel) {
        alerts.push(toAlert(storm, "alert_level_change", storm.alertLevel, direction));
    }

    if (hasChangedCourse(storm, previous) && direction !== null) {
        alerts.push(toAlert(storm, "track_change", direction, direction));
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
    const bearing = getMovementBearing(storm, previous);

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
        bearing: getMovementBearing(storm, previous) ?? previous?.bearing ?? null,
    };
}

function toAlert (
    storm: StormSummary,
    type: StormAlert["type"],
    signature: string,
    direction: string | null,
): StormAlert {
    return {
        type,
        trackingId: toStormTrackingId(storm.stormId),
        stormId: storm.stormId,
        stormName: storm.name,
        signature,
        lat: storm.lat,
        lon: storm.lon,
        windSpeed: storm.windSpeed,
        category: storm.category,
        alertLevel: storm.alertLevel,
        direction,
    };
}

function toDissipatedAlert (state: StormState): StormAlert {
    return {
        type: "storm_dissipated",
        trackingId: state.trackingId,
        stormId: state.stormId,
        stormName: state.name,
        signature: "",
        lat: state.lat,
        lon: state.lon,
        windSpeed: state.windSpeed,
        category: state.category,
        alertLevel: state.alertLevel,
        direction: null,
    };
}

/** Keyed on the episode-free identity so a GDACS episode bump is not a new alert. */
function toAlertKey (alert: StormAlert): string {
    return alert.trackingId + "|" + alert.type + "|" + alert.signature;
}

function toErrorMessage (error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
