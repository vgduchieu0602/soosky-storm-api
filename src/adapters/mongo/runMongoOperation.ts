import mongoose from "mongoose";
import StorageUnavailableError from "../../domain/errors/StorageUnavailableError.js";

export { isDuplicateKeyError, isMongoConnected, runMongoOperation };
export type {
    AlertCollection,
    DeleteOutcome,
    DeliveryCollection,
    StateCollection,
    SubscriptionCollection,
    UpdateOutcome,
    UpsertCollection,
};

interface UpdateOutcome {
    upsertedCount?: number | null;
}

interface DeleteOutcome {
    deletedCount?: number | null;
}

/**
 * Only the operations these repositories actually use, so a plain object can stand
 * in for a Mongoose model in tests.
 */
interface UpsertCollection {
    updateOne (
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
        options: { upsert: true },
    ): PromiseLike<UpdateOutcome>;
}

interface SubscriptionCollection extends UpsertCollection {
    deleteOne (filter: Record<string, unknown>): PromiseLike<DeleteOutcome>;
    find (filter: Record<string, unknown>): { lean (): PromiseLike<Record<string, unknown>[]> };
}

interface StateCollection extends UpsertCollection {
    deleteOne (filter: Record<string, unknown>): PromiseLike<DeleteOutcome>;
    find (filter: Record<string, unknown>): { lean (): PromiseLike<Record<string, unknown>[]> };
}

interface DeliveryCollection extends UpsertCollection {
    deleteMany (filter: Record<string, unknown>): PromiseLike<DeleteOutcome>;
}

interface AlertCollection {
    /** Unordered, so one already-recorded alert does not stop the rest of the batch. */
    insertMany (
        documents: Record<string, unknown>[],
        options: { ordered: false },
    ): PromiseLike<unknown[]>;
    find (filter: Record<string, unknown>): {
        sort (spec: Record<string, 1 | -1>): {
            limit (count: number): { lean (): PromiseLike<Record<string, unknown>[]> };
        };
    };
}

function isMongoConnected (): boolean {
    return mongoose.connection.readyState === 1;
}

/**
 * The database may be unreachable while the rest of the API keeps serving, so the
 * connection is checked first and driver failures never reach the caller raw.
 */
async function runMongoOperation<T> (
    operation: () => PromiseLike<T>,
    isConnected: () => boolean = isMongoConnected,
): Promise<T> {
    if (!isConnected()) {
        throw new StorageUnavailableError();
    }

    try {
        return await operation();
    } catch (error) {
        throw new StorageUnavailableError("The storage request could not be completed.", { cause: error });
    }
}

/** The driver's duplicate-key error arrives wrapped, so the cause chain is walked. */
function isDuplicateKeyError (error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    if ((error as unknown as { code?: unknown }).code === 11000) {
        return true;
    }

    return error.cause === undefined ? false : isDuplicateKeyError(error.cause);
}
