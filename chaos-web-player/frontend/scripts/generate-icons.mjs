// Genera icon-192.png e icon-512.png da icon.svg
// Da eseguire una volta: `node scripts/generate-icons.mjs`

import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const svg = await fs.readFile(path.join(publicDir, "icon.svg"));

for (const size of [192, 512]) {
  const out = path.join(publicDir, `icon-${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log(`✓ ${out}`);
}

console.log("Icone generate.");