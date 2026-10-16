// Genera icon-192.png e icon-512.png da chaos-logo.png
// Da eseguire una volta: `node scripts/generate-icons.mjs`

import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

// Sorgente: chaos-logo.png (PNG)
const srcPng = path.join(publicDir, "chaos-logo.png");
const srcBuffer = await fs.readFile(srcPng);

for (const size of [192, 512]) {
  const out = path.join(publicDir, `icon-${size}.png`);
  await sharp(srcBuffer)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toFile(out);
  console.log(`✓ ${out}`);
}

console.log("Icone generate da chaos-logo.png.");
