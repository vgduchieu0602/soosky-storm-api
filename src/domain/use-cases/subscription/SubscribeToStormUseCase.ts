import StormSubscription from "../../entities/subscription/StormSubscription.js";
import StormSubscriptionRepository from "../../repositories/subscription/IStormSubscriptionRepository.js";

export { SubscribeToStormUseCase as default };
export type { SubscribeToStormResult };

interface SubscribeToStormResult {
    stormId: string;
    subscribed: true;
    alreadySubscribed: boolean;
}

class SubscribeToStormUseCase {
    public constructor (private readonly _stormSubscriptionRepo: StormSubscriptionRepository) {}

    public async execute (subscription: StormSubscription): Promise<SubscribeToStormResult> {
        const created = await this._stormSubscriptionRepo.subscribe(subscription);

        return {
            stormId: subscription.stormId,
            subscribed: true,
            alreadySubscribed: !created,
        };
    }
}
