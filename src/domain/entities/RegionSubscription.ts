export { MAX_REGION_RADIUS_KM, MIN_REGION_RADIUS_KM };
export type { RegionSubscription as default };

const MIN_REGION_RADIUS_KM = 1;
const MAX_REGION_RADIUS_KM = 2000;

interface RegionSubscription {
    deviceToken: string;
    lat: number;
    lon: number;
    radiusKm: number;
}
