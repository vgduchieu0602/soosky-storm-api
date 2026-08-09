import StormSubscription from "../../entities/StormSubscription.js";
import StormSubscriptionRepository from "../../repositories/IStormSubscriptionRepository.js";

export { UnsubscribeFromStormUseCase as default };
export type { UnsubscribeFromStormResult };

interface UnsubscribeFromStormResult {
    stormId: string;
    subscribed: false;
    removed: boolean;
}

class UnsubscribeFromStormUseCase {
    public constructor (private readonly _stormSubscriptionRepo: StormSubscriptionRepository) {}

    public async execute (subscription: StormSubscription): Promise<UnsubscribeFromStormResult> {
        const removed = await this._stormSubscriptionRepo.unsubscribe(subscription);

        return {
            stormId: subscription.stormId,
            subscribed: false,
            removed,
        };
    }
}
