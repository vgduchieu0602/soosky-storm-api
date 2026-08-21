import PushNotification from "../../entities/notification/PushNotification.js";

export { PushNotificationRepository as default };

interface PushNotificationRepository {
    sendPushNotification (notification: PushNotification): Promise<void>;
}
