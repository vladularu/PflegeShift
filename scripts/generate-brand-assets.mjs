/* global Buffer */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve("assets/images");
const samplesPerAxis = 4;
const designSize = 1024;

const palette = {
  graphite: [17, 19, 21, 255],
  cream: [246, 243, 236, 255],
  petrol: [46, 118, 111, 255],
  black: [0, 0, 0, 255],
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function encodePng(size, pixels) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    rows[rowStart] = 0;
    pixels.copy(rows, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function insideCircle(x, y, centerX, centerY, radius) {
  const dx = x - centerX;
  const dy = y - centerY;
  return dx * dx + dy * dy <= radius * radius;
}

function insideCrescent(x, y) {
  const insideOuter = insideCircle(x, y, 512, 510, 314);
  const insideCutout = insideCircle(x, y, 512, 451, 269);
  return insideOuter && !insideCutout;
}

function crescentCoverage(pixelX, pixelY, size) {
  let covered = 0;
  for (let sampleY = 0; sampleY < samplesPerAxis; sampleY += 1) {
    for (let sampleX = 0; sampleX < samplesPerAxis; sampleX += 1) {
      const x = ((pixelX + (sampleX + 0.5) / samplesPerAxis) * designSize) / size;
      const y = ((pixelY + (sampleY + 0.5) / samplesPerAxis) * designSize) / size;
      if (insideCrescent(x, y)) covered += 1;
    }
  }
  return covered / (samplesPerAxis * samplesPerAxis);
}

function renderCrescent(size, background, foreground) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const coverage = crescentCoverage(x, y, size);
      const offset = (y * size + x) * 4;

      if (background === null) {
        pixels[offset] = foreground[0];
        pixels[offset + 1] = foreground[1];
        pixels[offset + 2] = foreground[2];
        pixels[offset + 3] = Math.round(foreground[3] * coverage);
        continue;
      }

      pixels[offset] = Math.round(background[0] * (1 - coverage) + foreground[0] * coverage);
      pixels[offset + 1] = Math.round(background[1] * (1 - coverage) + foreground[1] * coverage);
      pixels[offset + 2] = Math.round(background[2] * (1 - coverage) + foreground[2] * coverage);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function renderSolid(size, color) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  }
  return pixels;
}

function save(name, size, pixels) {
  writeFileSync(resolve(output, name), encodePng(size, pixels));
}

mkdirSync(output, { recursive: true });

save("icon.png", 1024, renderCrescent(1024, palette.petrol, palette.cream));
save("icon-dark.png", 1024, renderCrescent(1024, palette.graphite, palette.cream));
save("icon-tinted.png", 1024, renderCrescent(1024, palette.cream, palette.graphite));
save("splash-icon.png", 512, renderCrescent(512, null, palette.petrol));
save("splash-icon-dark.png", 512, renderCrescent(512, null, palette.cream));
save("favicon.png", 48, renderCrescent(48, palette.petrol, palette.cream));
save("android-icon-background.png", 432, renderSolid(432, palette.petrol));
save("android-icon-foreground.png", 432, renderCrescent(432, null, palette.cream));
save("android-icon-monochrome.png", 432, renderCrescent(432, null, palette.black));

console.log("Generated 9 deterministic LUNA Shift brand assets in assets/images");
