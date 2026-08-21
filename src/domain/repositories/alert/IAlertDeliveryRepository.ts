export { AlertDeliveryRepository as default };

interface AlertDeliveryRepository {
    /**
     * Records that a device is being sent an alert, returning false when the exact
     * same alert was already recorded. This is what stops repeat notifications.
     */
    claimDelivery (deviceToken: string, alertKey: string): Promise<boolean>;
    /** Drops recorded deliveries for a storm once it is no longer tracked. */
    removeDeliveries (stormId: string): Promise<void>;
}
