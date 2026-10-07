import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'branding');
const size = 1024;
const scale = size / 512;
const green = [35, 122, 87, 255];
const lightGreen = [113, 174, 127, 255];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(name, data) {
  const type = Buffer.from(name);
  const body = Buffer.concat([type, data]);
  const header = Buffer.alloc(4); header.writeUInt32BE(data.length);
  const footer = Buffer.alloc(4); footer.writeUInt32BE(crc32(body));
  return Buffer.concat([header, body, footer]);
}

function makePng(background) {
  const pixels = Buffer.alloc(size * size * 4);
  const paint = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const index = (Math.floor(y) * size + Math.floor(x)) * 4;
    pixels.set(color, index);
  };
  if (background) for (let i = 0; i < pixels.length; i += 4) pixels.set(background, i);

  const disk = (cx, cy, radius, color) => {
    cx *= scale; cy *= scale; radius *= scale;
    const r2 = radius * radius;
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(size - 1, Math.ceil(cy + radius)); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(size - 1, Math.ceil(cx + radius)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) paint(x, y, color);
      }
    }
  };
  const line = (x1, y1, x2, y2, width, color) => {
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * scale * 1.5);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      disk(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, width / 2, color);
    }
  };
  const polygon = (points, color) => {
    points = points.map(([x, y]) => [x * scale, y * scale]);
    const minX = Math.max(0, Math.floor(Math.min(...points.map(([x]) => x))));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(...points.map(([x]) => x))));
    const minY = Math.max(0, Math.floor(Math.min(...points.map(([, y]) => y))));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(...points.map(([, y]) => y))));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i]; const [xj, yj] = points[j];
        if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) paint(x, y, color);
    }
  };

  const cx = 256, cy = 256, radius = 171, stroke = 27;
  const arc = (start, end) => {
    const points = Math.ceil((end - start) * 2.6 * scale);
    for (let i = 0; i <= points; i++) {
      const a = (start + ((end - start) * i) / points) * Math.PI / 180;
      disk(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, stroke / 2, green);
    }
  };
  arc(18, 156);
  arc(198, 336);
  const arrow = (angle) => {
    const a = angle * Math.PI / 180;
    const x = cx + Math.cos(a) * radius, y = cy + Math.sin(a) * radius;
    const tangent = a + Math.PI / 2;
    const backX = x - Math.cos(tangent) * 22, backY = y - Math.sin(tangent) * 22;
    polygon([[x, y], [backX + Math.cos(a) * 21, backY + Math.sin(a) * 21], [backX - Math.cos(a) * 21, backY - Math.sin(a) * 21]], green);
  };
  arrow(156); arrow(336);

  const nodes = [[256, 205], [208, 292], [304, 292]];
  for (const [x, y] of nodes) line(cx, cy + 6, x, y, 20, lightGreen);
  disk(cx, cy + 6, 34, green);
  for (const [x, y] of nodes) disk(x, y, 27, green);
  disk(cx, cy + 6, 10, [255, 255, 255, 255]);
  for (const [x, y] of nodes) disk(x, y, 9, [255, 255, 255, 255]);

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) pixels.copy(scanlines, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(scanlines, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

await mkdir(root, { recursive: true });
await writeFile(join(root, 'reusehub-mark.png'), makePng(null));
await writeFile(join(root, 'reusehub-app-icon.png'), makePng([247, 248, 243, 255]));
console.log(`Generated ReUseHub brand mark and app icon in ${root}`);
