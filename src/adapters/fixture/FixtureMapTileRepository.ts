import { deflateSync } from "node:zlib";
import MapTile, { MapLayer, MapTileQuery } from "../../domain/entities/map/MapTile.js";
import MapTileRepository from "../../domain/repositories/map/IMapTileRepository.js";

export { FixtureMapTileRepository as default };

const TILE_SIZE = 256;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const LAYER_COLORS: Readonly<Record<MapLayer, readonly [number, number, number]>> = {
    windSpeed: [20, 144, 184],
    temperature: [225, 96, 61],
    pressure: [74, 105, 196],
    precipitation: [49, 137, 103],
};

/**
 * Produces deterministic PNG map tiles locally. The imagery is deliberately
 * synthetic, but it gives map renderers a non-empty tile for every valid layer.
 */
class FixtureMapTileRepository implements MapTileRepository {
    public async getTile (query: MapTileQuery): Promise<MapTile> {
        return {
            buffer: createTile(query),
            contentType: "image/png",
        };
    }
}

function createTile (query: MapTileQuery): Buffer {
    const pixels = Buffer.alloc(((TILE_SIZE * 4) + 1) * TILE_SIZE);
    const [red, green, blue] = LAYER_COLORS[query.layer];
    const tileOffset = (query.x * 17) + (query.y * 29) + (query.z * 13);

    for (let y = 0; y < TILE_SIZE; y += 1) {
        const rowStart = y * ((TILE_SIZE * 4) + 1);
        pixels[rowStart] = 0;

        for (let x = 0; x < TILE_SIZE; x += 1) {
            const wave = Math.round(24 * Math.sin((x + y + tileOffset) / 22));
            const contour = (x + y + tileOffset) % 48 < 2 ? 24 : 0;
            const pixel = rowStart + (x * 4) + 1;

            pixels[pixel] = clamp(red + wave + contour);
            pixels[pixel + 1] = clamp(green + wave + contour);
            pixels[pixel + 2] = clamp(blue + wave + contour);
            pixels[pixel + 3] = 255;
        }
    }

    return Buffer.concat([
        PNG_SIGNATURE,
        createChunk("IHDR", createHeader()),
        createChunk("IDAT", deflateSync(pixels)),
        createChunk("IEND", Buffer.alloc(0)),
    ]);
}

function createHeader (): Buffer {
    const header = Buffer.alloc(13);

    header.writeUInt32BE(TILE_SIZE, 0);
    header.writeUInt32BE(TILE_SIZE, 4);
    header[8] = 8;
    header[9] = 6;
    header[10] = 0;
    header[11] = 0;
    header[12] = 0;

    return header;
}

function createChunk (type: string, data: Buffer): Buffer {
    const typeBuffer = Buffer.from(type, "ascii");
    const chunk = Buffer.alloc(12 + data.length);

    chunk.writeUInt32BE(data.length, 0);
    typeBuffer.copy(chunk, 4);
    data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);

    return chunk;
}

function crc32 (data: Buffer): number {
    let crc = 0xffff_ffff;

    for (const byte of data) {
        crc ^= byte;

        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
        }
    }

    return (crc ^ 0xffff_ffff) >>> 0;
}

function clamp (value: number): number {
    return Math.max(0, Math.min(255, value));
}
