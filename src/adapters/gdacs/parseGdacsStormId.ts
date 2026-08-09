export { parseGdacsStormId as default };
export type { GdacsStormId };

interface GdacsStormId {
    eventId: string;
    episodeId: string;
}

const GDACS_STORM_ID_PATTERN = /^gdacs:TC:([1-9]\d*):([1-9]\d*)$/;

function parseGdacsStormId (stormId: string): GdacsStormId | null {
    const match = GDACS_STORM_ID_PATTERN.exec(stormId);
    const eventId = match?.[1];
    const episodeId = match?.[2];

    if (!eventId || !episodeId) {
        return null;
    }

    return { eventId, episodeId };
}
