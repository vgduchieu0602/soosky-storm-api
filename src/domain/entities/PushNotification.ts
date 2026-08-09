export type { PushNotification as default, PushNotificationReceipt };

interface PushNotification {
    deviceToken: string;
    title: string;
    description: string;
}

interface PushNotificationReceipt {
    title: string;
    description: string;
    sent: boolean;
}
