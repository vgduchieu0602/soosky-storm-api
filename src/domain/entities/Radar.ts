interface RadarFrame {
    time: string;
    path: string;
}

interface Radar {
    source: "rainviewer";
    attribution: "Weather data by RainViewer";
    attributionUrl: "https://www.rainviewer.com/";
    host: string;
    tileTemplate: string;
    past: RadarFrame[];
    nowcast: RadarFrame[];
    generatedAt: string;
    cachedUntil: string | null;
}

export { Radar as default };
export type { RadarFrame };
