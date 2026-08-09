import PushNotification from "../entities/PushNotification.js";

export { PushNotificationRepository as default };

interface PushNotificationRepository {
    sendPushNotification (notification: PushNotification): Promise<void>;
}
