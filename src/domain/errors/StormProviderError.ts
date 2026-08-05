export { StormProviderError as default };

class StormProviderError extends Error {
    public constructor (message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "StormProviderError";
    }
}
