import PushNotification from "../../domain/entities/notification/PushNotification.js";
import PushNotificationRepository from "../../domain/repositories/notification/IPushNotificationRepository.js";

export { FixturePushNotificationRepository as default };

/** Accepts notifications without loading credentials or contacting APNs. */
class FixturePushNotificationRepository implements PushNotificationRepository {
    public async sendPushNotification (_notification: PushNotification): Promise<void> {}
}
