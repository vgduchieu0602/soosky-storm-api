export { StormNotFoundError as default };

class StormNotFoundError extends Error {
    public constructor (stormId: string) {
        super("Storm [" + stormId + "] was not found.");
        this.name = "StormNotFoundError";
    }
}
