export type { PushNotification as default, PushNotificationReceipt };

interface PushNotification {
    deviceToken: string;
    title: string;
    description: string;
    /** APNs custom payload fields for clients to route an automatic alert. */
    data?: Readonly<Record<string, string>>;
}

interface PushNotificationReceipt {
    title: string;
    description: string;
    sent: boolean;
}
