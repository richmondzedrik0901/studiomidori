/**
 * scripts/slice-icons.mjs
 * Extracts each of the 24 transparent icons with pixel-perfect boundaries.
 */

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_IMG = 'C:/Users/Jaslalala/.gemini/antigravity-ide/brain/38117689-acb9-4082-a050-0d72f73b44f3/.user_uploaded/media_1791529199643.png';
const OUT_DIR = resolve(ROOT, 'public/icons/ui');

const ROW_DEFS = [
  {
    name: 'Row 0 (Drinks & Ceremony)',
    yMin: 21, yMax: 249,
    icons: [
      { name: 'drink-matcha-latte', xMin: 26, xMax: 161 },
      { name: 'drink-strawberry-matcha', xMin: 182, xMax: 326 },
      { name: 'drink-matcha-cloud', xMin: 347, xMax: 493 },
      { name: 'drink-hojicha', xMin: 508, xMax: 643 },
      { name: 'matcha-bowl', xMin: 666, xMax: 849 },
      { name: 'bamboo-whisk', xMin: 873, xMax: 998 }
    ]
  },
  {
    name: 'Row 1 (Utility & Order)',
    yMin: 260, yMax: 408,
    icons: [
      { name: 'cart', xMin: 28, xMax: 180 },
      { name: 'bag', xMin: 203, xMax: 334 },
      { name: 'user', xMin: 369, xMax: 492 },
      { name: 'location', xMin: 539, xMax: 648 },
      { name: 'calendar', xMin: 687, xMax: 820 },
      { name: 'clock', xMin: 863, xMax: 997 }
    ]
  },
  {
    name: 'Row 2 (Actions & Fulfillment)',
    yMin: 423, yMax: 534,
    icons: [
      { name: 'search', xMin: 28, xMax: 138 },
      { name: 'heart', xMin: 175, xMax: 279 },
      { name: 'chat', xMin: 320, xMax: 444 },
      { name: 'scooter', xMin: 476, xMax: 648 },
      { name: 'package', xMin: 667, xMax: 833 },
      { name: 'gift', xMin: 873, xMax: 1000 }
    ]
  },
  {
    name: 'Row 3 (Badges & Trust)',
    yMin: 540, yMax: 668,
    icons: [
      { name: 'discount', xMin: 23, xMax: 139 },
      { name: 'shield', xMin: 200, xMax: 303 },
      { name: 'card', xMin: 351, xMax: 484 },
      { name: 'leaves', xMin: 539, xMax: 658 },
      { name: 'star', xMin: 696, xMax: 818 },
      { name: 'question', xMin: 860, xMax: 996 }
    ]
  }
];

async function run() {
  await mkdir(OUT_DIR, { recursive: true });

  const image = sharp(SOURCE_IMG);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, channels } = info;

  console.log('Extracting 24 icons with exact row and column boundaries...');

  for (const row of ROW_DEFS) {
    for (const icon of row.icons) {
      // Find exact bounding box within [xMin, xMax] and [yMin, yMax]
      let minX = icon.xMax, maxX = icon.xMin;
      let minY = row.yMax, maxY = row.yMin;
      let found = false;

      for (let y = row.yMin; y <= row.yMax; y++) {
        for (let x = icon.xMin; x <= icon.xMax; x++) {
          const idx = (y * width + x) * channels;
          const alpha = data[idx + 3];
          if (alpha > 15) {
            found = true;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (!found) {
        console.warn(`No pixels found for ${icon.name}`);
        continue;
      }

      const pad = 2;
      const left = Math.max(0, minX - pad);
      const top = Math.max(0, minY - pad);
      const w = Math.min(width - left, (maxX - minX + 1) + pad * 2);
      const h = Math.min(info.height - top, (maxY - minY + 1) + pad * 2);

      const cropped = sharp(SOURCE_IMG).extract({ left, top, width: w, height: h });

      const pngPath = resolve(OUT_DIR, `${icon.name}.png`);
      const webpPath = resolve(OUT_DIR, `${icon.name}.webp`);

      await cropped.clone().png({ compressionLevel: 9 }).toFile(pngPath);
      await cropped.clone().webp({ lossless: true }).toFile(webpPath);

      console.log(`  ✓ ${icon.name.padEnd(24)} (${w}x${h})`);
    }
  }

  console.log('\nAll 24 icons extracted with clean boundaries!');
}

run().catch(console.error);
