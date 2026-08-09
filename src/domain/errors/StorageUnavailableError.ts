export { StorageUnavailableError as default };

/**
 * The database is optional at startup, so storage-backed endpoints report their own
 * unavailability instead of letting a driver error surface as an internal fault.
 */
class StorageUnavailableError extends Error {
    public constructor (message = "Storage is temporarily unavailable.", options?: ErrorOptions) {
        super(message, options);
        this.name = "StorageUnavailableError";
    }
}
