export { toStormTrackingId };

function toStormTrackingId (stormId: string): string {
    const match = /^(gdacs:TC:[1-9]\d*):[1-9]\d*$/.exec(stormId);

    return match?.[1] ?? stormId;
}
