import RegionSubscription from "../../entities/RegionSubscription.js";
import RegionSubscriptionRepository from "../../repositories/IRegionSubscriptionRepository.js";

export { SaveRegionSubscriptionUseCase as default };
export type { SaveRegionSubscriptionResult };

interface SaveRegionSubscriptionResult {
    lat: number;
    lon: number;
    radiusKm: number;
    saved: true;
}

class SaveRegionSubscriptionUseCase {
    public constructor (private readonly _regionSubscriptionRepo: RegionSubscriptionRepository) {}

    public async execute (subscription: RegionSubscription): Promise<SaveRegionSubscriptionResult> {
        await this._regionSubscriptionRepo.saveRegion(subscription);

        return {
            lat: subscription.lat,
            lon: subscription.lon,
            radiusKm: subscription.radiusKm,
            saved: true,
        };
    }
}
