// Genera favicon.png 32x32 da chaos-logo.png
// Da eseguire una volta: `node scripts/generate-favicon.mjs`

import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const srcPng = path.join(publicDir, "chaos-logo.png");
const srcBuffer = await fs.readFile(srcPng);

const out = path.join(publicDir, "favicon.png");
await sharp(srcBuffer)
  .resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } })
  .png()
  .toFile(out);

console.log(`✓ ${out}`);
