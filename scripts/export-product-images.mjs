import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

async function exportImages() {
  const res = await fetch('https://studiomidori-abf73-default-rtdb.asia-southeast1.firebasedatabase.app/menu/products.json');
  const products = await res.json();
  const outDir = path.resolve('public/img/products');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('Extracting product photos from orders/Firebase...');
  for (const [key, p] of Object.entries(products)) {
    if (p.image && p.image.startsWith('data:image/')) {
      const base64Data = p.image.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const jpgPath = path.join(outDir, `${p.id}.jpg`);
      const webpPath = path.join(outDir, `${p.id}.webp`);

      fs.writeFileSync(jpgPath, buffer);
      await sharp(buffer).webp({ quality: 85 }).toFile(webpPath);

      console.log(`✓ Exported ${p.name} (${p.id}): ${buffer.length} bytes -> ${p.id}.jpg & ${p.id}.webp`);
    } else {
      console.log(`! No base64 image for ${p.name}`);
    }
  }
}

exportImages().catch(console.error);
