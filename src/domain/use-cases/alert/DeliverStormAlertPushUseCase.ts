import RegionSubscription from "../../entities/subscription/RegionSubscription.js";
import StormAlert from "../../entities/alert/StormAlert.js";
import { buildStormAlertMessage } from "../../services/alertMessages.js";
import { getDistanceKm } from "../../services/geo.js";
import AlertDeliveryRepository from "../../repositories/alert/IAlertDeliveryRepository.js";
import RegionSubscriptionRepository from "../../repositories/subscription/IRegionSubscriptionRepository.js";
import StormSubscriptionRepository from "../../repositories/subscription/IStormSubscriptionRepository.js";
import SendPushNotificationUseCase from "../notification/SendPushNotificationUseCase.js";

export { DeliverStormAlertPushUseCase as default };
export type { DeliverStormAlertPushResult };

interface DeliverStormAlertPushResult {
    sent: number;
    skippedAsDuplicate: number;
    failed: number;
}

/**
 * Pushes alerts that have already been recorded. Everything here is best-effort: the
 * alerts are durable whatever happens, so a device without a token, a rejected token,
 * or an unreachable APNs never costs anything but a push.
 */
class DeliverStormAlertPushUseCase {
    public constructor (
        private readonly _stormSubscriptions: StormSubscriptionRepository,
        private readonly _regionSubscriptions: RegionSubscriptionRepository,
        private readonly _deliveries: AlertDeliveryRepository,
        private readonly _sendPushNotification: SendPushNotificationUseCase,
        private readonly _logError: (message: string) => void = (message) => console.error(message),
    ) {}

    public async execute (alerts: StormAlert[]): Promise<DeliverStormAlertPushResult> {
        if (!alerts.length) {
            return { sent: 0, skippedAsDuplicate: 0, failed: 0 };
        }

        const regions = await this._regionSubscriptions.listRegions();
        let sent = 0;
        let skippedAsDuplicate = 0;
        let failed = 0;

        for (const alert of alerts) {
            const outcome = await this._deliver(alert, regions);

            sent += outcome.sent;
            skippedAsDuplicate += outcome.skippedAsDuplicate;
            failed += outcome.failed;

            // A dissipated storm produces no further alerts, so its claims are dead
            // weight. The recorded alerts themselves are untouched.
            if (alert.type === "storm_dissipated") {
                await this._deliveries.removeDeliveries(alert.trackingId);
            }
        }

        return { sent, skippedAsDuplicate, failed };
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
            // Re-rendered per device: the stored wording has no distance in it.
            const message = buildStormAlertMessage(alert, distanceKm);

            try {
                if (!await this._deliveries.claimDelivery(deviceToken, toDeliveryKey(alert))) {
                    skippedAsDuplicate += 1;
                    continue;
                }

                await this._sendPushNotification.execute({
                    deviceToken,
                    title: message.title,
                    description: message.description,
                    stormId: alert.stormId,
                    type: alert.type,
                    data: {
                        trackingId: alert.trackingId,
                    },
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
}

/** One claim per device per recorded alert; the alert's own id already identifies it. */
function toDeliveryKey (alert: StormAlert): string {
    return alert.id;
}

function toErrorMessage (error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
