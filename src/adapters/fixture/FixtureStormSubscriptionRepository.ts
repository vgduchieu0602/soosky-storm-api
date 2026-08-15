import StormSubscription from "../../domain/entities/StormSubscription.js";
import StormSubscriptionRepository from "../../domain/repositories/IStormSubscriptionRepository.js";
import { toStormTrackingId } from "../../domain/stormIdentity.js";

export { FixtureStormSubscriptionRepository as default };

interface StoredSubscription extends StormSubscription {
    trackingId: string;
}

/** Process-local subscription storage for exercising idempotent client flows. */
class FixtureStormSubscriptionRepository implements StormSubscriptionRepository {
    private readonly _subscriptions = new Map<string, StoredSubscription>();

    public async subscribe (subscription: StormSubscription): Promise<boolean> {
        const key = toKey(subscription);

        if (this._subscriptions.has(key)) {
            return false;
        }

        this._subscriptions.set(key, {
            ...subscription,
            trackingId: toStormTrackingId(subscription.stormId),
        });
        return true;
    }

    public async unsubscribe (subscription: StormSubscription): Promise<boolean> {
        return this._subscriptions.delete(toKey(subscription));
    }

    public async listDeviceTokensForStorm (trackingId: string): Promise<string[]> {
        return [...this._subscriptions.values()]
            .filter((subscription) => subscription.trackingId === trackingId)
            .map((subscription) => subscription.deviceToken);
    }
}

function toKey (subscription: StormSubscription): string {
    return subscription.deviceToken + "\u0000" + subscription.stormId;
}
