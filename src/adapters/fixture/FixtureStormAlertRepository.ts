import StormAlert from "../../domain/entities/alert/StormAlert.js";
import StormAlertRepository from "../../domain/repositories/alert/IStormAlertRepository.js";

export { FixtureStormAlertRepository as default };

/**
 * Process-local alert storage seeded with the fixture storms. The alert scheduler does
 * not run in fixture mode, so without this the alerts screen would have nothing to show.
 */
class FixtureStormAlertRepository implements StormAlertRepository {
    private readonly _alerts = new Map<string, StormAlert>(
        SEEDED_ALERTS.map((alert) => [alert.id, alert]),
    );

    public async saveAlerts (alerts: StormAlert[]): Promise<number> {
        let saved = 0;

        for (const alert of alerts) {
            if (this._alerts.has(alert.id)) {
                continue;
            }

            this._alerts.set(alert.id, alert);
            saved += 1;
        }

        return saved;
    }

    public async listAlertsByTrackingIds (trackingIds: string[], limit: number): Promise<StormAlert[]> {
        return [...this._alerts.values()]
            .filter((alert) => trackingIds.includes(alert.trackingId))
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .slice(0, limit);
    }
}

const SEEDED_ALERTS: readonly StormAlert[] = [
    {
        id: "nhc:AL032026|category_change|category_2|2026-08-08T12:00:00.000Z",
        type: "category_change",
        trackingId: "nhc:AL032026",
        stormId: "nhc:AL032026",
        stormName: "HURRICANE CHARLIE",
        previousValue: "category_1",
        currentValue: "category_2",
        lat: 25.1,
        lon: -68.3,
        windSpeed: 90,
        category: "category_2",
        title: "HURRICANE CHARLIE strengthened",
        description: "HURRICANE CHARLIE strengthened from Category 1 to Category 2."
            + " Winds now at 167 km/h. Review evacuation route. Power outages likely",
        observedAt: "2026-08-08T12:00:00.000Z",
        createdAt: "2026-08-08T12:04:00.000Z",
    },
    {
        id: "nhc:AL032026|new_storm||2026-08-08T06:00:00.000Z",
        type: "new_storm",
        trackingId: "nhc:AL032026",
        stormId: "nhc:AL032026",
        stormName: "HURRICANE CHARLIE",
        previousValue: null,
        currentValue: null,
        lat: 24.2,
        lon: -66.9,
        windSpeed: 75,
        category: "category_1",
        title: "New storm: HURRICANE CHARLIE",
        description: "HURRICANE CHARLIE formed. Secure loose items, check emergency supplies now",
        observedAt: "2026-08-08T06:00:00.000Z",
        createdAt: "2026-08-08T06:03:00.000Z",
    },
    {
        id: "nhc:AL022026|watch_warning|Storm surge watch/warning advisory 2026-07-19T18:00:00.000Z|"
            + "2026-07-19T18:00:00.000Z",
        type: "watch_warning",
        trackingId: "nhc:AL022026",
        stormId: "nhc:AL022026",
        stormName: "TROPICAL STORM BERYL",
        previousValue: null,
        currentValue: "Storm surge watch/warning advisory 2026-07-19T18:00:00.000Z",
        lat: 22.4,
        lon: -77.8,
        windSpeed: 60,
        category: null,
        title: "TROPICAL STORM BERYL watch/warning updated",
        description: "Storm surge watch/warning advisory 2026-07-19T18:00:00.000Z applies to"
            + " TROPICAL STORM BERYL.",
        observedAt: "2026-07-19T18:00:00.000Z",
        createdAt: "2026-07-19T18:02:00.000Z",
    },
];
