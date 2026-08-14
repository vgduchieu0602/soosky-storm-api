import PushNotification, { PushNotificationReceipt } from "../../entities/PushNotification.js";
import PushNotificationRepository from "../../repositories/IPushNotificationRepository.js";

export { SendPushNotificationUseCase as default };

class SendPushNotificationUseCase {
    public constructor (private readonly _pushNotificationRepo: PushNotificationRepository) {}

    public async execute (notification: PushNotification): Promise<PushNotificationReceipt> {
        await this._pushNotificationRepo.sendPushNotification(notification);

        const receipt: PushNotificationReceipt = {
            title: notification.title,
            description: notification.description,
            sent: true,
        };

        if (notification.stormId !== undefined) {
            receipt.stormId = notification.stormId;
        }

        if (notification.type !== undefined) {
            receipt.type = notification.type;
        }

        return receipt;
    }
}
