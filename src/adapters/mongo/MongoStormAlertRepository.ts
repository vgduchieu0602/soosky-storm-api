import StormAlert, { STORM_ALERT_TYPES, StormAlertType } from "../../domain/entities/alert/StormAlert.js";
import { StormCategory } from "../../domain/entities/storm/StormSummary.js";
import StormAlertRepository from "../../domain/repositories/alert/IStormAlertRepository.js";
import { StormAlertModel } from "./models.js";
import { AlertCollection, isDuplicateKeyError, isMongoConnected, runMongoOperation } from "./runMongoOperation.js";

export { MongoStormAlertRepository as default };

class MongoStormAlertRepository implements StormAlertRepository {
    public constructor (
        private readonly _alerts: AlertCollection = StormAlertModel,
        private readonly _isConnected: () => boolean = isMongoConnected,
    ) {}

    public async saveAlerts (alerts: StormAlert[]): Promise<number> {
        if (!alerts.length) {
            return 0;
        }

        try {
            const inserted = await runMongoOperation(
                () => this._alerts.insertMany(alerts.map(toDocument), { ordered: false }),
                this._isConnected,
            );

            return inserted.length;
        } catch (error) {
            // The alert was already recorded by a cycle that did not get to update the
            // storm state before it stopped. That is the design, not a failure.
            if (isDuplicateKeyError(error)) {
                return 0;
            }

            throw error;
        }
    }

    public async listAlertsByTrackingIds (trackingIds: string[], limit: number): Promise<StormAlert[]> {
        if (!trackingIds.length) {
            return [];
        }

        const documents = await runMongoOperation(
            () => this._alerts
                .find({ trackingId: { $in: trackingIds } })
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean(),
            this._isConnected,
        );

        return documents.map(toStormAlert);
    }
}

function toDocument (alert: StormAlert): Record<string, unknown> {
    return {
        _id: alert.id,
        trackingId: alert.trackingId,
        stormId: alert.stormId,
        stormName: alert.stormName,
        type: alert.type,
        previousValue: alert.previousValue,
        currentValue: alert.currentValue,
        lat: alert.lat,
        lon: alert.lon,
        windSpeed: alert.windSpeed,
        category: alert.category,
        title: alert.title,
        description: alert.description,
        observedAt: alert.observedAt,
        createdAt: new Date(alert.createdAt),
    };
}

function toStormAlert (document: Record<string, unknown>): StormAlert {
    return {
        id: String(document._id),
        type: isStormAlertType(document.type) ? document.type : "new_storm",
        trackingId: String(document.trackingId),
        stormId: String(document.stormId),
        stormName: String(document.stormName),
        previousValue: typeof document.previousValue === "string" ? document.previousValue : null,
        currentValue: typeof document.currentValue === "string" ? document.currentValue : null,
        lat: Number(document.lat),
        lon: Number(document.lon),
        windSpeed: typeof document.windSpeed === "number" ? document.windSpeed : null,
        category: isStormCategory(document.category) ? document.category : null,
        title: String(document.title),
        description: String(document.description),
        observedAt: typeof document.observedAt === "string" ? document.observedAt : "",
        createdAt: toIsoString(document.createdAt),
    };
}

function toIsoString (value: unknown): string {
    if (value instanceof Date) {
        return value.toISOString();
    }

    return typeof value === "string" ? value : new Date(0).toISOString();
}

function isStormAlertType (value: unknown): value is StormAlertType {
    return STORM_ALERT_TYPES.some((type) => type === value);
}

function isStormCategory (value: unknown): value is StormCategory {
    return value === "category_1"
        || value === "category_2"
        || value === "category_3"
        || value === "category_4"
        || value === "category_5";
}
