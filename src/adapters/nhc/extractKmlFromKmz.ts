import AdmZip from "adm-zip";
import StormProviderError from "../../domain/errors/StormProviderError.js";

export { extractKmlFromKmz as default };

function extractKmlFromKmz (data: Buffer): string {
    try {
        const archive = new AdmZip(data);
        const entry = archive.getEntries().find((item) => {
            return item.entryName.toLowerCase().endsWith(".kml");
        });

        if (!entry) {
            throw new StormProviderError("NHC KMZ did not contain a KML file.");
        }

        return entry.getData().toString("utf-8");
    } catch (error) {
        if (error instanceof StormProviderError) {
            throw error;
        }

        throw new StormProviderError("NHC KMZ could not be read.", { cause: error });
    }
}
