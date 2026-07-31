/* global Buffer */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve("assets/images");

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

function createCanvas(size, color) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    pixels[index * 4] = color[0];
    pixels[index * 4 + 1] = color[1];
    pixels[index * 4 + 2] = color[2];
    pixels[index * 4 + 3] = color[3];
  }
  return { size, pixels };
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const offset = (y * canvas.size + x) * 4;
  canvas.pixels[offset] = color[0];
  canvas.pixels[offset + 1] = color[1];
  canvas.pixels[offset + 2] = color[2];
  canvas.pixels[offset + 3] = color[3];
}

function roundedRect(canvas, left, top, right, bottom, radius, color) {
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const nearestX = Math.max(left + radius, Math.min(x, right - radius - 1));
      const nearestY = Math.max(top + radius, Math.min(y, bottom - radius - 1));
      const dx = x - nearestX;
      const dy = y - nearestY;
      if (dx * dx + dy * dy <= radius * radius) setPixel(canvas, x, y, color);
    }
  }
}

function circle(canvas, centerX, centerY, radius, color) {
  const squared = radius * radius;
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= squared) setPixel(canvas, x, y, color);
    }
  }
}

function drawMark(canvas, scale, monochrome = false) {
  const teal = monochrome ? [0, 0, 0, 255] : [32, 122, 104, 255];
  const mint = monochrome ? [0, 0, 0, 255] : [100, 212, 182, 255];
  const white = monochrome ? [0, 0, 0, 0] : [255, 255, 255, 255];
  const purple = monochrome ? teal : [126, 87, 194, 255];
  const green = monochrome ? teal : [47, 163, 107, 255];
  const red = monochrome ? teal : [234, 91, 85, 255];
  const blue = monochrome ? teal : [47, 128, 237, 255];
  const p = (value) => Math.round(value * scale);

  roundedRect(canvas, p(150), p(145), p(850), p(855), p(160), teal);
  if (monochrome) {
    roundedRect(canvas, p(260), p(245), p(740), p(765), p(60), teal);
    return;
  }
  roundedRect(canvas, p(260), p(245), p(740), p(765), p(60), white);
  roundedRect(canvas, p(260), p(245), p(740), p(390), p(60), mint);
  roundedRect(canvas, p(260), p(330), p(740), p(390), 0, mint);

  const centers = [
    [360, 485, purple],
    [500, 485, green],
    [640, 485, red],
    [360, 625, blue],
    [640, 625, purple],
  ];
  for (const [x, y, color] of centers) circle(canvas, p(x), p(y), p(45), color);
  roundedRect(canvas, p(470), p(555), p(530), p(695), p(22), teal);
  roundedRect(canvas, p(430), p(595), p(570), p(655), p(22), teal);
}

function encode(canvas) {
  const rows = Buffer.alloc((canvas.size * 4 + 1) * canvas.size);
  for (let y = 0; y < canvas.size; y += 1) {
    const rowStart = y * (canvas.size * 4 + 1);
    rows[rowStart] = 0;
    canvas.pixels.copy(rows, rowStart + 1, y * canvas.size * 4, (y + 1) * canvas.size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(canvas.size, 0);
  header.writeUInt32BE(canvas.size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function save(name, size, background, draw) {
  const canvas = createCanvas(size, background);
  draw(canvas, size / 1000);
  writeFileSync(resolve(output, name), encode(canvas));
}

save("icon.png", 1024, [231, 245, 240, 255], (canvas, scale) => drawMark(canvas, scale));
save("splash-icon.png", 512, [0, 0, 0, 0], (canvas, scale) => drawMark(canvas, scale));
save("favicon.png", 48, [231, 245, 240, 255], (canvas, scale) => drawMark(canvas, scale));
save("android-icon-background.png", 432, [231, 245, 240, 255], () => {});
save("android-icon-foreground.png", 432, [0, 0, 0, 0], (canvas, scale) => drawMark(canvas, scale));
save("android-icon-monochrome.png", 432, [0, 0, 0, 0], (canvas, scale) => drawMark(canvas, scale, true));
