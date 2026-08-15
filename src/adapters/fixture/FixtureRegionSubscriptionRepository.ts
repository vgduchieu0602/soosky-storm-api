import RegionSubscription from "../../domain/entities/RegionSubscription.js";
import RegionSubscriptionRepository from "../../domain/repositories/IRegionSubscriptionRepository.js";

export { FixtureRegionSubscriptionRepository as default };

/** Process-local region storage. Each save replaces the device's previous region. */
class FixtureRegionSubscriptionRepository implements RegionSubscriptionRepository {
    private readonly _regions = new Map<string, RegionSubscription>();

    public async listRegions (): Promise<RegionSubscription[]> {
        return [...this._regions.values()].map((region) => ({ ...region }));
    }

    public async saveRegion (subscription: RegionSubscription): Promise<void> {
        this._regions.set(subscription.deviceToken, { ...subscription });
    }
}
