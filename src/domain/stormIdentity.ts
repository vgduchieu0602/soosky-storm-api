export { toStormTrackingId };

/**
 * GDACS bumps `episodeid` every time it republishes an event, so the storm ID of a
 * single physical storm keeps changing. Tracking state and subscriptions by the
 * episode-free identity stops one storm from looking new on every update.
 */
function toStormTrackingId (stormId: string): string {
    const match = /^(gdacs:TC:[1-9]\d*):[1-9]\d*$/.exec(stormId);

    return match?.[1] ?? stormId;
}
