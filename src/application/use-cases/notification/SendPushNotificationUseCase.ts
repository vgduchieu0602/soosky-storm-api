import PushNotification, { PushNotificationReceipt } from "../../../domain/entities/notification/PushNotification.js";
import PushNotificationRepository from "../../../domain/repositories/notification/IPushNotificationRepository.js";

export { SendPushNotificationUseCase as default };

class SendPushNotificationUseCase {
    public constructor (private readonly _pushNotificationRepo: PushNotificationRepository) {}

    public async execute (notification: PushNotification): Promise<PushNotificationReceipt> {
        await this._pushNotificationRepo.sendPushNotification(notification);

        return {
            title: notification.title,
            description: notification.description,
            sent: true,
            stormId: notification.stormId ?? null,
            type: notification.type ?? null,
        };
    }
}
