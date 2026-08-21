import Radar from "../../entities/radar/Radar.js";

interface RadarRepository {
    getRadar (): Promise<Radar>;
}

export { RadarRepository as default };
