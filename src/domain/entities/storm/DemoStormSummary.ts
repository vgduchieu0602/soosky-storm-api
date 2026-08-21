import StormSummary from "./StormSummary.js";

export { DemoStormSummary as default };

interface DemoStormSummary extends StormSummary {
    isDemo: true;
}
