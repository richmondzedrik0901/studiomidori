import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const PRODUCTS = [
  'classic-matcha-latte',
  'hojicha-latte',
  'seasalt-hojicha-cloud',
  'seaslat-cloud-matcha',
  'strawberry-matcha'
];

async function processAll() {
  const dir = path.resolve('public/img/products');

  for (const id of PRODUCTS) {
    const srcPng = path.join(dir, `${id}.png`);
    const srcJpg = path.join(dir, `${id}.jpg`);
    const outWebp = path.join(dir, `${id}.webp`);
    const outPng = path.join(dir, `${id}.png`);
    const outJpg = path.join(dir, `${id}.jpg`);

    if (fs.existsSync(srcPng)) {
      const buffer = fs.readFileSync(srcPng);
      await sharp(buffer).webp({ quality: 92, alphaQuality: 100 }).toFile(outWebp);
      await sharp(buffer).flatten({ background: '#FAF7F2' }).jpeg({ quality: 92 }).toFile(outJpg);
      console.log(`✓ Updated from PNG: ${id} -> webp, jpg`);
      continue;
    }

    if (!fs.existsSync(srcJpg)) {
      console.warn(`File not found: ${srcJpg}`);
      continue;
    }

    const { data, info } = await sharp(srcJpg)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    const visited = new Uint8Array(w * h);
    const queue = [];

    // Push all border pixels
    for (let x = 0; x < w; x++) {
      queue.push(x, 0);
      queue.push(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      queue.push(0, y);
      queue.push(w - 1, y);
    }

    let head = 0;
    while (head < queue.length) {
      const x = queue[head++];
      const y = queue[head++];
      const idx = y * w + x;
      if (visited[idx]) continue;
      visited[idx] = 1;

      const p = idx * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];

      // If near-white (background)
      if (r >= 244 && g >= 244 && b >= 244) {
        data[p + 3] = 0; // Transparent
        if (x > 0 && !visited[idx - 1]) queue.push(x - 1, y);
        if (x < w - 1 && !visited[idx + 1]) queue.push(x + 1, y);
        if (y > 0 && !visited[idx - w]) queue.push(x, y - 1);
        if (y < h - 1 && !visited[idx + w]) queue.push(x, y + 1);
      } else if (r >= 235 && g >= 235 && b >= 235) {
        // Soft antialiased edge
        const avg = (r + g + b) / 3;
        data[p + 3] = Math.round(255 * (1 - (avg - 235) / 10));
      }
    }

    // Now trim the transparent border so the cup fills nicely
    const rawBuffer = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .trim()
      .png()
      .toBuffer();

    // Save as WebP (alpha enabled), PNG (transparent), and JPG (blended to card surface #FAF7F2)
    await sharp(rawBuffer).webp({ quality: 90, alphaQuality: 100 }).toFile(outWebp);
    await sharp(rawBuffer).png({ compressionLevel: 9 }).toFile(outPng);
    await sharp(rawBuffer).flatten({ background: '#FAF7F2' }).jpeg({ quality: 92 }).toFile(outJpg);

    console.log(`✓ Processed & trimmed: ${id} -> webp, png, jpg`);
  }
}

processAll().catch(console.error);
