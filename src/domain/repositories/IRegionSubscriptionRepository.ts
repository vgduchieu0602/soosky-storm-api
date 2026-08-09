import RegionSubscription from "../entities/RegionSubscription.js";

export { RegionSubscriptionRepository as default };

interface RegionSubscriptionRepository {
    /** Stores the one region a device follows, replacing any previous one. */
    saveRegion (subscription: RegionSubscription): Promise<void>;
    /** Every saved region; the radius check runs in memory at this scale. */
    listRegions (): Promise<RegionSubscription[]>;
}
