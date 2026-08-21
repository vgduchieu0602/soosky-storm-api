export { COMPASS_POINTS, getBearing, getDistanceKm, toCompassDirection };

const EARTH_RADIUS_KM = 6371;

const COMPASS_POINTS = [
    "N", "NNE", "NE", "ENE",
    "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW",
    "W", "WNW", "NW", "NNW",
] as const;

interface Position {
    lat: number;
    lon: number;
}

/** Great-circle distance. Accurate enough to decide whether a storm is near a user. */
function getDistanceKm (from: Position, to: Position): number {
    const latDelta = toRadians(to.lat - from.lat);
    const lonDelta = toRadians(to.lon - from.lon);
    const fromLat = toRadians(from.lat);
    const toLat = toRadians(to.lat);
    const a = Math.sin(latDelta / 2) ** 2
        + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lonDelta / 2) ** 2;

    return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing from one point to another, in degrees clockwise from north. */
function getBearing (from: Position, to: Position): number {
    const fromLat = toRadians(from.lat);
    const toLat = toRadians(to.lat);
    const lonDelta = toRadians(to.lon - from.lon);
    const y = Math.sin(lonDelta) * Math.cos(toLat);
    const x = Math.cos(fromLat) * Math.sin(toLat)
        - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(lonDelta);

    return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function toCompassDirection (bearing: number): string {
    const index = Math.round(((bearing % 360) + 360) % 360 / 22.5) % COMPASS_POINTS.length;

    return COMPASS_POINTS[index] ?? "N";
}

function toRadians (degrees: number): number {
    return degrees * Math.PI / 180;
}

function toDegrees (radians: number): number {
    return radians * 180 / Math.PI;
}
