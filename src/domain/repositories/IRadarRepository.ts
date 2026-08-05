import Radar from "../entities/Radar.js";

interface RadarRepository {
    getRadar (): Promise<Radar>;
}

export { RadarRepository as default };
