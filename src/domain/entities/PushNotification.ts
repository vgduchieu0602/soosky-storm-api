import { StormAlertType } from "./StormAlert.js";

export type { PushNotification as default, PushNotificationReceipt };

interface PushNotification {
    deviceToken: string;
    title: string;
    description: string;
    /** Storm the push refers to; clients open that storm screen from it. */
    stormId?: string;
    /** Alert kind the push reports, so a manual push routes like an automatic one. */
    type?: StormAlertType;
    /** APNs custom payload fields for clients to route an automatic alert. */
    data?: Readonly<Record<string, string>>;
}

interface PushNotificationReceipt {
    title: string;
    description: string;
    sent: boolean;
    /** Always present so clients never branch on a missing key; null when the push carried none. */
    stormId: string | null;
    type: StormAlertType | null;
}
