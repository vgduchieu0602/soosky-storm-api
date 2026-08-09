import StormSubscription from "../entities/StormSubscription.js";

export { StormSubscriptionRepository as default };

interface StormSubscriptionRepository {
    /** Returns false when the device was already subscribed to the storm. */
    subscribe (subscription: StormSubscription): Promise<boolean>;
    /** Returns false when there was no subscription to remove. */
    unsubscribe (subscription: StormSubscription): Promise<boolean>;
    /** Device tokens following a storm, matched on its episode-free tracking ID. */
    listDeviceTokensForStorm (trackingId: string): Promise<string[]>;
}
