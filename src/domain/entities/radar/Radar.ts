interface RadarFrame {
    time: string;
    path: string;
}

interface Radar {
    source: "rainviewer" | "fixture";
    attribution: string;
    attributionUrl: string;
    host: string;
    tileTemplate: string;
    past: RadarFrame[];
    nowcast: RadarFrame[];
    generatedAt: string;
    cachedUntil: string | null;
}

export { Radar as default };
export type { RadarFrame };
