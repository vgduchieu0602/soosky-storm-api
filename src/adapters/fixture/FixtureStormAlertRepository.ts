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
    // Alerts are keyed on the episode-free tracking ID, so querying any episode of
    // this GDACS event -- :51, :53, whichever the client last saw -- finds them both.
    {
        id: "gdacs:TC:1001297|alert_level_change|Orange|2026-08-08T12:00:00.000Z",
        type: "alert_level_change",
        trackingId: "gdacs:TC:1001297",
        stormId: "gdacs:TC:1001297:51",
        stormName: "DOLPHIN-26",
        previousValue: "Green",
        currentValue: "Orange",
        lat: 27,
        lon: 124.8,
        windSpeed: 145,
        category: "category_5",
        title: "DOLPHIN-26 alert level: Orange",
        description: "The alert level for DOLPHIN-26 changed from Green to Orange.",
        observedAt: "2026-08-08T12:00:00.000Z",
        createdAt: "2026-08-08T12:06:00.000Z",
    },
    {
        id: "gdacs:TC:1001297|category_change|category_5|2026-08-08T06:00:00.000Z",
        type: "category_change",
        trackingId: "gdacs:TC:1001297",
        stormId: "gdacs:TC:1001297:49",
        stormName: "DOLPHIN-26",
        previousValue: "category_4",
        currentValue: "category_5",
        lat: 26.1,
        lon: 126.2,
        windSpeed: 145,
        category: "category_5",
        title: "DOLPHIN-26 strengthened",
        description: "DOLPHIN-26 strengthened from Category 4 to Category 5."
            + " Winds now at 269 km/h. Extreme danger. Leave immediately if ordered.",
        observedAt: "2026-08-08T06:00:00.000Z",
        createdAt: "2026-08-08T06:05:00.000Z",
    },
    {
        id: "gdacs:TC:1001432|new_storm||2026-08-08T09:00:00.000Z",
        type: "new_storm",
        trackingId: "gdacs:TC:1001432",
        stormId: "gdacs:TC:1001432:3",
        stormName: "MANGKHUT-26",
        previousValue: null,
        currentValue: null,
        lat: 18.3,
        lon: 121.4,
        windSpeed: 45,
        category: null,
        title: "New storm: MANGKHUT-26",
        description: "MANGKHUT-26 formed.",
        observedAt: "2026-08-08T09:00:00.000Z",
        createdAt: "2026-08-08T09:02:00.000Z",
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
